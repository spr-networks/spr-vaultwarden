package main

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strings"
)

// Environment variable representation
type EnvVar struct {
	Key          string `json:"key"`
	Value        string `json:"value"`
	Enabled      bool   `json:"enabled"`
	Description  string `json:"description"`
	IsComment    bool   `json:"isComment"`
	IsSection    bool   `json:"isSection"`
	OriginalLine string `json:"originalLine"`
}

// Request structure for saving environment variables
type SaveEnvRequest struct {
	Variables []EnvVar `json:"variables"`
}

// Request structure for SSL file upload
type SSLUploadRequest struct {
	Filename string `json:"filename"`
	FileData string `json:"fileData"` // base64 encoded file data
	Size     int64  `json:"size"`
}

// SSL file info structure
type SSLFileInfo struct {
	Name     string `json:"name"`
	Size     int64  `json:"size"`
	ModTime  string `json:"modTime"`
	Exists   bool   `json:"exists"`
}

const (
	socketPath   = "/state/plugins/vaultwarden/socket"
	envPath      = "/configs/.env"
	templatePath = "/configs/.env.template"
	sslPath      = "/ssl"
	certFile     = "cert"
	keyFile      = "key"
)

// Allowed file extensions for SSL files
var allowedSSLExtensions = map[string]bool{
	".pem": true,
	".crt": true,
	".cer": true,
	".der": true,
	".key": true,
	".p12": true,
	".pfx": true,
}

func main() {
	log.Println("Starting Vaultwarden plugin")

	// Create required directories if they don't exist
	if err := os.MkdirAll("/configs", 0755); err != nil {
		log.Fatalf("Error creating configs directory: %v", err)
	}
	if err := os.MkdirAll(sslPath, 0755); err != nil {
		log.Fatalf("Error creating SSL directory: %v", err)
	}

	// Setup HTTP handlers
	http.HandleFunc("/test", handleTest)
	http.HandleFunc("/api/env", handleEnv)
	http.HandleFunc("/api/ssl/upload", handleSSLUpload)
	http.HandleFunc("/api/ssl/delete", handleSSLDelete)
	http.HandleFunc("/api/ssl/status", handleSSLStatus)

	// Serve static frontend files
	fs := http.FileServer(http.Dir("/ui"))
	http.Handle("/", fs)

	// Clean up the socket if it exists
	if _, err := os.Stat(socketPath); err == nil {
		if err := os.Remove(socketPath); err != nil {
			log.Fatalf("Error removing existing socket: %v", err)
		}
	}

	// Create Unix socket listener
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		log.Fatalf("Error creating Unix socket: %v", err)
	}

	log.Printf("Server listening on Unix socket: %s", socketPath)
	log.Fatal(http.Serve(listener, nil))
}

// Handle test endpoint
func handleTest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status": "ok", "message": "Vaultwarden .env Editor plugin is running"}`)
}

// Handle environment variables API
func handleEnv(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		getEnvVars(w, r)
	case http.MethodPut:
		saveEnvVars(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Get environment variables
func getEnvVars(w http.ResponseWriter, r *http.Request) {
	// Try to read .env file first, fallback to template
	filePath := envPath
	if _, err := os.Stat(envPath); os.IsNotExist(err) {
		if _, err := os.Stat(templatePath); os.IsNotExist(err) {
			http.Error(w, "Neither .env file nor template found", http.StatusNotFound)
			return
		}
		filePath = templatePath
	}

	// Read file content
	content, err := ioutil.ReadFile(filePath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to read file: %v", err), http.StatusInternalServerError)
		return
	}

	// Parse environment variables
	vars := parseEnvFile(string(content))

	// Return result
	json.NewEncoder(w).Encode(map[string]interface{}{
		"variables": vars,
		"filePath":  filePath,
	})
}

// Save environment variables
func saveEnvVars(w http.ResponseWriter, r *http.Request) {
	// Parse request body
	var request SaveEnvRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Create backup if file exists
	if _, err := os.Stat(envPath); err == nil {
		backupPath := envPath + ".bak"
		input, err := ioutil.ReadFile(envPath)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to read original file for backup: %v", err), http.StatusInternalServerError)
			return
		}

		if err := ioutil.WriteFile(backupPath, input, 0644); err != nil {
			http.Error(w, fmt.Sprintf("Failed to create backup file: %v", err), http.StatusInternalServerError)
			return
		}
	}

	// Generate new file content
	var content strings.Builder
	for _, v := range request.Variables {
		if v.IsSection {
			// Add section header
			content.WriteString(v.OriginalLine)
			content.WriteString("\n")
		} else if v.Key == "" && v.IsComment {
			// Add original comment line
			content.WriteString(v.OriginalLine)
			content.WriteString("\n")
		} else {
			// Add description comments if present
			if v.Description != "" {
				// Split description into lines and add each as a comment
				descLines := strings.Split(v.Description, "\n")
				for _, line := range descLines {
					content.WriteString("# ")
					content.WriteString(line)
					content.WriteString("\n")
				}
			}

			// Add variable with or without comment
			if v.Enabled {
				content.WriteString(fmt.Sprintf("%s=%s", v.Key, v.Value))
			} else {
				content.WriteString(fmt.Sprintf("# %s=%s", v.Key, v.Value))
			}
			content.WriteString("\n")
		}
	}

	// Write new content to file
	if err := ioutil.WriteFile(envPath, []byte(content.String()), 0644); err != nil {
		http.Error(w, fmt.Sprintf("Failed to write file: %v", err), http.StatusInternalServerError)
		return
	}

	// Restart vaultwarden service
	cmd := exec.Command("/scripts/vwctl", "restart")
	if err := cmd.Run(); err != nil {
		log.Printf("Warning: Failed to restart vaultwarden service: %v", err)
	}

	// Return success response with the updated file path
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"message":   "Environment variables saved successfully",
		"filePath":  envPath,
		"variables": request.Variables, // Return the saved variables so frontend can update
	})
}

// Handle SSL file upload
func handleSSLUpload(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse JSON request body
	var request SSLUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Get file type from query parameter
	fileType := r.URL.Query().Get("type")
	if fileType != "cert" && fileType != "key" {
		http.Error(w, "Invalid file type. Must be 'cert' or 'key'", http.StatusBadRequest)
		return
	}

	// Validate file extension from filename
	ext := strings.ToLower(request.Filename[strings.LastIndex(request.Filename, "."):])
	if !allowedSSLExtensions[ext] {
		http.Error(w, "Invalid file extension. Allowed: .pem, .crt, .cer, .der, .key, .p12, .pfx", http.StatusBadRequest)
		return
	}

	// Decode base64 file data
	fileBytes, err := base64.StdEncoding.DecodeString(request.FileData)
	if err != nil {
		http.Error(w, "Invalid base64 file data", http.StatusBadRequest)
		return
	}

	// Determine destination filename (user cannot influence the path or base name)
	var destFile string
	if fileType == "cert" {
		destFile = fmt.Sprintf("%s/%s%s", sslPath, certFile, ext)
	} else {
		destFile = fmt.Sprintf("%s/%s%s", sslPath, keyFile, ext)
	}

	// Create backup if file exists
	if _, err := os.Stat(destFile); err == nil {
		backupFile := destFile + ".bak"
		input, err := ioutil.ReadFile(destFile)
		if err != nil {
			http.Error(w, "Failed to create backup", http.StatusInternalServerError)
			return
		}
		if err := ioutil.WriteFile(backupFile, input, 0600); err != nil {
			http.Error(w, "Failed to write backup", http.StatusInternalServerError)
			return
		}
	}

	// Write to destination with restrictive permissions
	if err := ioutil.WriteFile(destFile, fileBytes, 0600); err != nil {
		http.Error(w, "Failed to save file", http.StatusInternalServerError)
		return
	}

	// Update ROCKET_TLS environment variable if both cert and key exist
	certExists := fileExists(fmt.Sprintf("%s/%s*", sslPath, certFile))
	keyExists := fileExists(fmt.Sprintf("%s/%s*", sslPath, keyFile))

	if certExists && keyExists {
		// Get cert and key file paths
		certFiles, _ := findFiles(fmt.Sprintf("%s/%s*", sslPath, certFile))
		keyFiles, _ := findFiles(fmt.Sprintf("%s/%s*", sslPath, keyFile))

		if len(certFiles) > 0 && len(keyFiles) > 0 {
			// Update ROCKET_TLS variable in .env file
			rocketTLSValue := fmt.Sprintf("{certs=\"%s\",key=\"%s\"}", certFiles[0], keyFiles[0])
			updateRocketTLSVariable(rocketTLSValue)
		}

		// Restart vaultwarden service
		cmd := exec.Command("/scripts/vwctl", "restart")
		if err := cmd.Run(); err != nil {
			log.Printf("Warning: Failed to restart vaultwarden service: %v", err)
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"message":  fmt.Sprintf("%s file uploaded successfully", strings.Title(fileType)),
		"filename": destFile,
	})
}

// Handle SSL file deletion
func handleSSLDelete(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get file type from query parameter
	fileType := r.URL.Query().Get("type")
	if fileType != "cert" && fileType != "key" {
		http.Error(w, "Invalid file type. Must be 'cert' or 'key'", http.StatusBadRequest)
		return
	}

	// Find and delete the file
	var pattern string
	if fileType == "cert" {
		pattern = fmt.Sprintf("%s/%s*", sslPath, certFile)
	} else {
		pattern = fmt.Sprintf("%s/%s*", sslPath, keyFile)
	}

	// Find files matching the pattern
	files, err := findFiles(pattern)
	if err != nil || len(files) == 0 {
		http.Error(w, fmt.Sprintf("%s file not found", strings.Title(fileType)), http.StatusNotFound)
		return
	}

	// Delete the file (should only be one)
	filePath := files[0]
	if err := os.Remove(filePath); err != nil {
		http.Error(w, "Failed to delete file", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("%s file deleted successfully", strings.Title(fileType)),
	})
}

// Handle SSL status check
func handleSSLStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check cert file
	certInfo := getSSLFileInfo(fmt.Sprintf("%s/%s*", sslPath, certFile))

	// Check key file
	keyInfo := getSSLFileInfo(fmt.Sprintf("%s/%s*", sslPath, keyFile))

	json.NewEncoder(w).Encode(map[string]interface{}{
		"cert": certInfo,
		"key":  keyInfo,
	})
}

// Helper function to get SSL file info
func getSSLFileInfo(pattern string) SSLFileInfo {
	files, err := findFiles(pattern)
	if err != nil || len(files) == 0 {
		return SSLFileInfo{Exists: false}
	}

	filePath := files[0]
	stat, err := os.Stat(filePath)
	if err != nil {
		return SSLFileInfo{Exists: false}
	}

	return SSLFileInfo{
		Name:    stat.Name(),
		Size:    stat.Size(),
		ModTime: stat.ModTime().Format("2006-01-02 15:04:05"),
		Exists:  true,
	}
}

// Helper function to check if file exists using pattern
func fileExists(pattern string) bool {
	files, err := findFiles(pattern)
	return err == nil && len(files) > 0
}

// Helper function to find files by pattern (simple implementation)
func findFiles(pattern string) ([]string, error) {
	// Extract directory from pattern
	dir := sslPath

	// Read directory
	entries, err := ioutil.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var matches []string
	// Simple pattern matching for our specific patterns
	if strings.Contains(pattern, certFile) {
		for _, entry := range entries {
			if !entry.IsDir() && strings.HasPrefix(entry.Name(), certFile) {
				matches = append(matches, fmt.Sprintf("%s/%s", dir, entry.Name()))
			}
		}
	} else if strings.Contains(pattern, keyFile) {
		for _, entry := range entries {
			if !entry.IsDir() && strings.HasPrefix(entry.Name(), keyFile) {
				matches = append(matches, fmt.Sprintf("%s/%s", dir, entry.Name()))
			}
		}
	}

	return matches, nil
}

// Update ROCKET_TLS variable in .env file
func updateRocketTLSVariable(tlsValue string) error {
	// Read current .env file content
	content, err := ioutil.ReadFile(envPath)
	if err != nil {
		// If .env doesn't exist, try template
		if _, err := os.Stat(templatePath); err == nil {
			content, err = ioutil.ReadFile(templatePath)
			if err != nil {
				return err
			}
		} else {
			return err
		}
	}

	lines := strings.Split(string(content), "\n")
	var newLines []string
	rocketTLSFound := false

	for _, line := range lines {
		trimmedLine := strings.TrimSpace(line)

		// Check if this line is ROCKET_TLS (enabled or disabled)
		if strings.HasPrefix(trimmedLine, "ROCKET_TLS=") || strings.HasPrefix(trimmedLine, "# ROCKET_TLS=") {
			rocketTLSFound = true
			// Preserve the enabled/disabled state, just update the value
			if strings.HasPrefix(trimmedLine, "#") {
				newLines = append(newLines, fmt.Sprintf("# ROCKET_TLS=%s", tlsValue))
			} else {
				newLines = append(newLines, fmt.Sprintf("ROCKET_TLS=%s", tlsValue))
			}
		} else {
			newLines = append(newLines, line)
		}
	}

	// If ROCKET_TLS wasn't found, add it as a commented line
	if !rocketTLSFound {
		newLines = append(newLines, fmt.Sprintf("# ROCKET_TLS=%s", tlsValue))
	}

	// Write updated content back to .env file
	newContent := strings.Join(newLines, "\n")
	return ioutil.WriteFile(envPath, []byte(newContent), 0644)
}

// Parse .env file content
func parseEnvFile(content string) []EnvVar {
	var vars []EnvVar
	scanner := bufio.NewScanner(strings.NewReader(content))

	var lines []string
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	for i, line := range lines {
		trimmedLine := strings.TrimSpace(line)

		// Skip empty lines
		if trimmedLine == "" {
			vars = append(vars, EnvVar{
				IsComment:    true,
				OriginalLine: line,
			})
			continue
		}

		// Check for section headers
		if strings.HasPrefix(trimmedLine, "##") {
			vars = append(vars, EnvVar{
				IsComment:    false,
				IsSection:    true,
				OriginalLine: line,
			})
			continue
		}

		// Check if line is commented
		isCommented := strings.HasPrefix(trimmedLine, "#")
		cleanLine := trimmedLine
		if isCommented {
			cleanLine = strings.TrimSpace(strings.TrimPrefix(trimmedLine, "#"))
		}

		// Check if it's a key-value pair (even if commented)
		re := regexp.MustCompile(`^([A-Z0-9_]+)=(.*)$`)
		matches := re.FindStringSubmatch(cleanLine)

		if len(matches) == 3 {
			// This is a variable (enabled or disabled)
			description := extractDescription(lines, i)

			vars = append(vars, EnvVar{
				Key:          matches[1],
				Value:        matches[2],
				Enabled:      !isCommented,
				Description:  description,
				OriginalLine: line,
			})
		} else {
			// This is a pure comment line - only include if it's not
			// immediately before a variable (since those become descriptions)
			if !isCommentForNextVariable(lines, i) {
				vars = append(vars, EnvVar{
					IsComment:    true,
					OriginalLine: line,
				})
			}
		}
	}

	return vars
}

// Check if this comment line will become a description for the next variable
func isCommentForNextVariable(lines []string, currentIndex int) bool {
	// Only check regular comment lines (not section headers)
	currentLine := strings.TrimSpace(lines[currentIndex])
	if !strings.HasPrefix(currentLine, "#") || strings.HasPrefix(currentLine, "##") {
		return false
	}

	// Check if this is already a commented variable itself
	cleanCurrentLine := strings.TrimSpace(strings.TrimPrefix(currentLine, "#"))
	re := regexp.MustCompile(`^([A-Z0-9_]+)=(.*)$`)
	if re.MatchString(cleanCurrentLine) {
		// This is a commented variable, not a description comment
		return false
	}

	// Look ahead to see if there's a variable coming up that would use this as description
	for i := currentIndex + 1; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])

		// Skip empty lines
		if line == "" {
			continue
		}

		// If we hit a section header, stop looking
		if strings.HasPrefix(line, "##") {
			break
		}

		// If we hit another comment, check if it's a variable or continue looking
		if strings.HasPrefix(line, "#") {
			cleanLine := strings.TrimSpace(strings.TrimPrefix(line, "#"))
			if re.MatchString(cleanLine) {
				// Found a commented variable - this comment will be used as description
				return true
			}
			// It's another description comment, continue looking
			continue
		}

		// Check if this is an enabled variable
		if re.MatchString(line) {
			// Found an enabled variable - this comment will be used as description
			return true
		}

		// If we hit a non-comment, non-variable line, stop looking
		break
	}

	return false
}

// Extract description from preceding comment lines
func extractDescription(lines []string, lineIndex int) string {
	i := lineIndex - 1

	// Collect all consecutive comment lines before this variable
	var commentLines []string
	for i >= 0 {
		line := strings.TrimSpace(lines[i])

		// Stop if we hit an empty line or non-comment
		if line == "" || !strings.HasPrefix(line, "#") {
			break
		}

		// Skip section headers (lines starting with ##)
		if strings.HasPrefix(line, "##") {
			break
		}

		// Check if this comment line is actually a commented variable
		cleanLine := strings.TrimSpace(strings.TrimPrefix(line, "#"))
		re := regexp.MustCompile(`^([A-Z0-9_]+)=(.*)$`)
		if re.MatchString(cleanLine) {
			// This is a commented variable, not a description comment
			break
		}

		// This is a description comment - remove the # prefix
		cleanLine = strings.TrimSpace(strings.TrimPrefix(line, "#"))
		commentLines = append([]string{cleanLine}, commentLines...)
		i--
	}

	// Join the comment lines into a description
	return strings.Join(commentLines, "\n")
}
