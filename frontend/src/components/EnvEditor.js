import React, { useState, useEffect, useRef } from 'react'
import {
  Box,
  Button,
  ButtonText,
  VStack,
  HStack,
  Heading,
  Text,
  ScrollView,
  FormControl,
  Input,
  InputField,
  Switch,
  Card,
  Spinner,
  Center,
  Alert,
  AlertIcon,
  useToast,
  ToastTitle,
  BadgeText,
  Badge,
  Pressable
} from '@gluestack-ui/themed'
import { api } from '../API.js'

const EnvEditor = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [envVars, setEnvVars] = useState([])
  const [filePath, setFilePath] = useState('')
  const [status, setStatus] = useState({ message: '', type: 'success', show: false })
  const [saveLoading, setSaveLoading] = useState(false)
  const [sslStatus, setSSLStatus] = useState({ cert: { exists: false }, key: { exists: false } })
  const [uploadLoading, setUploadLoading] = useState({ cert: false, key: false })
  const [deleteLoading, setDeleteLoading] = useState({ cert: false, key: false })
  const [collapsedSections, setCollapsedSections] = useState({})
  const certFileRef = useRef(null)
  const keyFileRef = useRef(null)
  const pluginURL = '/plugins/vw'
  const toast = useToast?.()

  // Fetch environment variables and SSL status on component mount
  useEffect(() => {
    fetchEnvVars()
    fetchSSLStatus()
  }, [])

  // Initialize collapsed sections state
  const initializeCollapsedSections = (groups) => {
    const collapsed = {};
    groups.forEach((_, index) => {
      collapsed[index] = true; // Set all sections to collapsed by default
    });
    return collapsed;
  };

  // Fetch SSL certificate status
  const fetchSSLStatus = async () => {
    try {
      const response = await api.get(`${pluginURL}/api/ssl/status`)
      setSSLStatus(response)
    } catch (err) {
      console.error('Error fetching SSL status:', err)
    }
  }

  // Handle file upload
  const handleFileUpload = async (fileType) => {
    const fileInput = fileType === 'cert' ? certFileRef.current : keyFileRef.current
    const file = fileInput?.files?.[0]
    
    if (!file) {
      setStatus({
        message: 'Please select a file to upload',
        type: 'error',
        show: true
      })
      return
    }

    // Validate file extension
    const allowedExtensions = ['.pem', '.crt', '.cer', '.der', '.key', '.p12', '.pfx']
    const fileName = file.name.toLowerCase()
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext))
    
    if (!hasValidExtension) {
      setStatus({
        message: `Invalid file extension. Allowed: ${allowedExtensions.join(', ')}`,
        type: 'error',
        show: true
      })
      return
    }

    setUploadLoading(prev => ({ ...prev, [fileType]: true }))

    try {
      // Read file as base64
      const fileBuffer = await file.arrayBuffer()
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)))
      
      // Send as JSON with base64 encoded file data
      const payload = {
        filename: file.name,
        fileData: base64Data,
        size: file.size
      }

      // Use api.put for consistency with environment variable API
      const response = await api.put(`${pluginURL}/api/ssl/upload?type=${fileType}`, payload)
      
      setUploadLoading(prev => ({ ...prev, [fileType]: false }))
      
      // Clear the file input
      if (fileInput) {
        fileInput.value = ''
      }
      
      // Refresh SSL status and env vars (to get updated ROCKET_TLS)
      await fetchSSLStatus()
      await fetchEnvVars()
      
      setStatus({
        message: response.message || `${fileType} file uploaded successfully`,
        type: 'success',
        show: true
      })

      if (toast) {
        toast.show({
          placement: "top",
          render: ({ id }) => (
            <Alert status="success" variant="solid">
              <AlertIcon />
              <ToastTitle>Upload Successful</ToastTitle>
            </Alert>
          )
        })
      }

      setTimeout(() => {
        setStatus(prev => ({ ...prev, show: false }))
      }, 3000)

    } catch (err) {
      console.error(`Error uploading ${fileType} file:`, err)
      setUploadLoading(prev => ({ ...prev, [fileType]: false }))
      
      setStatus({
        message: `Error uploading ${fileType} file: ${err.message}`,
        type: 'error',
        show: true
      })

      if (toast) {
        toast.show({
          placement: "top",
          render: ({ id }) => (
            <Alert status="error" variant="solid">
              <AlertIcon />
              <ToastTitle>Upload Failed</ToastTitle>
            </Alert>
          )
        })
      }
    }
  }

  // Handle file deletion
  const handleFileDelete = async (fileType) => {
    if (!window.confirm(`Are you sure you want to delete the ${fileType} file?`)) {
      return
    }

    setDeleteLoading(prev => ({ ...prev, [fileType]: true }))

    try {
      const response = await api.delete(`${pluginURL}/api/ssl/delete?type=${fileType}`)
      
      setDeleteLoading(prev => ({ ...prev, [fileType]: false }))
      
      // Refresh SSL status and env vars (to get updated ROCKET_TLS)
      await fetchSSLStatus()
      await fetchEnvVars()
      
      setStatus({
        message: response.message || `${fileType} file deleted successfully`,
        type: 'success',
        show: true
      })

      if (toast) {
        toast.show({
          placement: "top",
          render: ({ id }) => (
            <Alert status="success" variant="solid">
              <AlertIcon />
              <ToastTitle>Delete Successful</ToastTitle>
            </Alert>
          )
        })
      }

      setTimeout(() => {
        setStatus(prev => ({ ...prev, show: false }))
      }, 3000)

    } catch (err) {
      console.error(`Error deleting ${fileType} file:`, err)
      setDeleteLoading(prev => ({ ...prev, [fileType]: false }))
      
      setStatus({
        message: `Error deleting ${fileType} file: ${err.message}`,
        type: 'error',
        show: true
      })

      if (toast) {
        toast.show({
          placement: "top",
          render: ({ id }) => (
            <Alert status="error" variant="solid">
              <AlertIcon />
              <ToastTitle>Delete Failed</ToastTitle>
            </Alert>
          )
        })
      }
    }
  }
  
  // Function to fetch environment variables
  const fetchEnvVars = () => {
    setLoading(true)
    const apiURL = api.getApiURL()
    const gotAuth = api.getAuthHeaders()?.length ? true : false
    
    api
      .get(`${pluginURL}/api/env`)
      .then((data) => {
        // Process variables and filter out empty ones
        const processedVars = (data.variables || [])
          .map(variable => ({
            ...variable,
            value: variable.value !== undefined ? variable.value : ''
          }))
          .filter(variable => {
            if (variable.isComment) {
              return variable.originalLine && variable.originalLine.trim().length > 0
            }
            if (variable.isSection) {
              return (variable.description && variable.description.trim().length > 0) ||
                     (variable.originalLine && variable.originalLine.trim().length > 0)
            }
            return variable.key && variable.key.trim().length > 0
          })
        
        setEnvVars(processedVars)
        setFilePath(data.filePath || '')
        setLoading(false)
      })
      .catch((err) => {
        console.error('Error fetching environment variables:', err)
        let error = `Error: ${err.message || 'Failed to load environment variables'}`
        
        if (!apiURL) {
          error += '. Missing REACT_APP_API'
        }
        if (!gotAuth) {
          error += '. Missing REACT_APP_TOKEN'
        }
        
        setError(error)
        setLoading(false)
      })
  }
  
  // Function to save environment variables
  const saveEnvVars = async () => {
    setStatus({ message: '', type: 'success', show: false })
    setSaveLoading(true)
    
    try {
      const variablesToSend = envVars.map(({ key, value, enabled, isComment, isSection, originalLine, description }) => ({
        key,
        value,
        enabled,
        isComment,
        isSection,
        originalLine,
        description
      }))
      
      const payload = { 
        variables: variablesToSend
      }
      
      const response = await api.put(`${pluginURL}/api/env`, payload)
      
      // Handle successful save
      setSaveLoading(false)
      
      // Update variables if returned in response
      if (response.variables) {
        const processedVars = response.variables
          .map(variable => ({
            ...variable,
            value: variable.value !== undefined ? variable.value : ''
          }))
          .filter(variable => {
            if (variable.isComment) {
              return variable.originalLine && variable.originalLine.trim().length > 0
            }
            if (variable.isSection) {
              return (variable.description && variable.description.trim().length > 0) ||
                     (variable.originalLine && variable.originalLine.trim().length > 0)
            }
            return variable.key && variable.key.trim().length > 0
          })
        
        setEnvVars(processedVars)
      }
      
      // Update file path if returned in response
      if (response.filePath) {
        setFilePath(response.filePath)
      }
      
      // Show success message
      setStatus({
        message: response.message || 'Environment variables saved successfully',
        type: 'success',
        show: true
      })
      
      if (toast) {
        toast.show({
          placement: "top",
          render: ({ id }) => (
            <Alert status="success" variant="solid">
              <AlertIcon />
              <ToastTitle>Save Successful</ToastTitle>
            </Alert>
          )
        })
      }
      
      // Hide status message after 3 seconds
      setTimeout(() => {
        setStatus(prev => ({ ...prev, show: false }))
      }, 3000)
      
    } catch (err) {
      console.error('Error saving environment variables:', err)
      setSaveLoading(false)
      
      let errorMsg = `Error: ${err.message || 'Failed to save environment variables'}`
      const apiURL = api.getApiURL()
      const gotAuth = api.getAuthHeaders()?.length ? true : false
      
      if (!apiURL) {
        errorMsg += '. Missing REACT_APP_API'
      }
      if (!gotAuth) {
        errorMsg += '. Missing REACT_APP_TOKEN'
      }
      
      setStatus({
        message: errorMsg,
        type: 'error',
        show: true
      })
      
      if (toast) {
        toast.show({
          placement: "top",
          render: ({ id }) => (
            <Alert status="error" variant="solid">
              <AlertIcon />
              <ToastTitle>Save Failed</ToastTitle>
            </Alert>
          )
        })
      }
    }
  }
  
  // Function to clean section text for display (remove ## prefix)
  const cleanSectionText = (text) => {
    if (!text) return text
    return text.replace(/^##\s*/, '').trim()
  }

  // Get original index of a variable
  const getOriginalIndex = (variable) => {
    return envVars.findIndex(v => v === variable)
  }
  
  // Group variables by section for better UI organization
  const groupVariablesBySection = (variables) => {
    const groups = []
    let currentGroup = { section: null, variables: [] }
    
    variables.forEach((variable) => {
      if (variable.isSection) {
        if (currentGroup.variables.length > 0 || currentGroup.section) {
          groups.push(currentGroup)
        }
        currentGroup = { 
          section: variable,
          variables: []
        }
      } else {
        currentGroup.variables.push(variable)
      }
    })
    
    if (currentGroup.variables.length > 0 || currentGroup.section) {
      groups.push(currentGroup)
    }
    
    return groups
  }

  // Toggle variable enable/disable state
  const toggleVariable = (index) => {
    const updatedVars = [...envVars]
    updatedVars[index].enabled = !updatedVars[index].enabled
    setEnvVars(updatedVars)
  }
  
  // Update variable value
  const updateVariableValue = (index, newValue) => {
    const updatedVars = [...envVars]
    updatedVars[index].value = newValue
    setEnvVars(updatedVars)
  }
  
  // Toggle section collapse state
  const toggleSectionCollapse = (sectionIndex) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionIndex]: !prev[sectionIndex]
    }))
  }
  
  const groupedVariables = groupVariablesBySection(envVars)
  
  // Set default collapsed state when groups change
  useEffect(() => {
    setCollapsedSections(initializeCollapsedSections(groupedVariables));
  }, [envVars.length]);
  
  if (loading) {
    return (
      <Center h={300}>
        <Spinner size="large" />
      </Center>
    )
  }
  
  if (error) {
    return (
      <Alert status="error" variant="solid">
        <AlertIcon />
        <Text color="$white">{error}</Text>
      </Alert>
    )
  }
  
  return (
    <VStack
      space="md"
      p="$4"
      sx={{ _dark: { bg: '$backgroundDark800' } }}
    >
      <HStack justifyContent="space-between" alignItems="center">
        <VStack>
          <Heading size="md">spr-vaultwarden</Heading>
          <Text color="$textLight500" size="sm">Edit and manage Vaultwarden configuration</Text>
        </VStack>
        <HStack space="sm">
          <Button variant="outline" onPress={() => { fetchEnvVars(); fetchSSLStatus(); }}>
            <ButtonText>Refresh</ButtonText>
          </Button>
          <Button 
            onPress={saveEnvVars}
            isDisabled={saveLoading}
          >
            {saveLoading ? <Spinner size="small" color="$white" /> : <ButtonText>Save Changes</ButtonText>}
          </Button>
        </HStack>
      </HStack>
      
      {status.show && (
        <Alert 
          status={status.type} 
          variant="solid"
          sx={{
            bg: status.type === 'success' ? '$success700' : status.type === 'error' ? '$error700' : '$info700',
            _text: {
              color: '$white'
            }
          }}
        >
          <AlertIcon />
          <Text color="$white">{status.message}</Text>
        </Alert>
      )}
      
      {filePath && (
        <Card>
          <Box p="$4">
            <HStack space="sm">
              <Text fontWeight="$bold">File:</Text>
              <Text fontFamily="$mono">{filePath}</Text>
            </HStack>
          </Box>
        </Card>
      )}
      
      {/* SSL Certificate Management */}
      <Card>
        <Box p="$4">
          <Heading size="md" mb="$4">SSL Certificate Management</Heading>
          <Text color="$textLight500" size="sm" mb="$4">
            Upload SSL certificate and private key files for Rocket TLS. Supported formats: .pem, .crt, .cer, .der, .key, .p12, .pfx
          </Text>
          
          <VStack space="md">
            {/* Certificate Upload */}
            <Box>
              <HStack justifyContent="space-between" alignItems="center" mb="$2">
                <Text fontWeight="$medium">Certificate File</Text>
                {sslStatus.cert?.exists && (
                  <Badge variant="solid" status="success">
                    <BadgeText>Uploaded</BadgeText>
                  </Badge>
                )}
              </HStack>
              
              {sslStatus.cert?.exists && (
                <Box mb="$2" p="$2" bg="$backgroundLight100" borderRadius="$sm">
                  <Text fontSize="$xs" color="$textLight600">
                    File: {sslStatus.cert.name} ({(sslStatus.cert.size / 1024).toFixed(1)} KB)
                  </Text>
                  <Text fontSize="$xs" color="$textLight600">
                    Modified: {sslStatus.cert.modTime}
                  </Text>
                </Box>
              )}
              
              <HStack space="sm" alignItems="center">
                <Input flex={1}>
                  <input
                    ref={certFileRef}
                    type="file"
                    accept=".pem,.crt,.cer,.der,.key,.p12,.pfx"
                    style={{ width: '100%', padding: '8px' }}
                  />
                </Input>
                <Button
                  onPress={() => handleFileUpload('cert')}
                  isDisabled={uploadLoading.cert}
                  variant="outline"
                >
                  {uploadLoading.cert ? <Spinner size="small" /> : <ButtonText>Upload</ButtonText>}
                </Button>
                {sslStatus.cert?.exists && (
                  <Button
                    onPress={() => handleFileDelete('cert')}
                    isDisabled={deleteLoading.cert}
                    variant="outline"
                    status="error"
                  >
                    {deleteLoading.cert ? <Spinner size="small" /> : <ButtonText>Delete</ButtonText>}
                  </Button>
                )}
              </HStack>
            </Box>
            
            {/* Private Key Upload */}
            <Box>
              <HStack justifyContent="space-between" alignItems="center" mb="$2">
                <Text fontWeight="$medium">Private Key File</Text>
                {sslStatus.key?.exists && (
                  <Badge variant="solid" status="success">
                    <BadgeText>Uploaded</BadgeText>
                  </Badge>
                )}
              </HStack>
              
              {sslStatus.key?.exists && (
                <Box mb="$2" p="$2" bg="$backgroundLight100" borderRadius="$sm">
                  <Text fontSize="$xs" color="$textLight600">
                    File: {sslStatus.key.name} ({(sslStatus.key.size / 1024).toFixed(1)} KB)
                  </Text>
                  <Text fontSize="$xs" color="$textLight600">
                    Modified: {sslStatus.key.modTime}
                  </Text>
                </Box>
              )}
              
              <HStack space="sm" alignItems="center">
                <Input flex={1}>
                  <input
                    ref={keyFileRef}
                    type="file"
                    accept=".pem,.crt,.cer,.der,.key,.p12,.pfx"
                    style={{ width: '100%', padding: '8px' }}
                  />
                </Input>
                <Button
                  onPress={() => handleFileUpload('key')}
                  isDisabled={uploadLoading.key}
                  variant="outline"
                >
                  {uploadLoading.key ? <Spinner size="small" /> : <ButtonText>Upload</ButtonText>}
                </Button>
                {sslStatus.key?.exists && (
                  <Button
                    onPress={() => handleFileDelete('key')}
                    isDisabled={deleteLoading.key}
                    variant="outline"
                    status="error"
                  >
                    {deleteLoading.key ? <Spinner size="small" /> : <ButtonText>Delete</ButtonText>}
                  </Button>
                )}
              </HStack>
            </Box>
            
            {/* SSL Status Summary */}
            {(sslStatus.cert?.exists || sslStatus.key?.exists) && (
              <Box p="$3" bg="$backgroundLight50" borderRadius="$sm">
                <Text fontSize="$sm" fontWeight="$medium" mb="$1">SSL Configuration Status:</Text>
                <Text fontSize="$xs" color="$textLight600">
                  Certificate: {sslStatus.cert?.exists ? '✓ Uploaded' : '✗ Missing'}
                </Text>
                <Text fontSize="$xs" color="$textLight600">
                  Private Key: {sslStatus.key?.exists ? '✓ Uploaded' : '✗ Missing'}
                </Text>
                {sslStatus.cert?.exists && sslStatus.key?.exists && (
                  <Text fontSize="$xs" color="$success600" mt="$1" fontWeight="$medium">
                    ✓ SSL is ready for use. Vaultwarden will restart automatically when both files are present.
                  </Text>
                )}
              </Box>
            )}
          </VStack>
        </Box>
      </Card>
      
      <ScrollView h="$3/4">
        <VStack space="md">
          {groupedVariables.map((group, groupIndex) => (
            <Card key={groupIndex}>
              <Box p="$4">
                {/* Section Header */}
                {group.section && (
                  <Pressable 
                    onPress={() => toggleSectionCollapse(groupIndex)}
                    mb={collapsedSections[groupIndex] ? "$0" : "$4"}
                  >
                    <HStack justifyContent="space-between" alignItems="center">
                      <HStack alignItems="center" space="md">
                        <Text 
                          color="$primary700" 
                          fontWeight="bold" 
                          fontSize="$lg"
                          width="$6"
                          textAlign="center"
                        >
                          {collapsedSections[groupIndex] ? "+" : "−"}
                        </Text>
                        <Box>
                          <Heading size="md" color="$primary500">
                            {cleanSectionText(group.section.description) || cleanSectionText(group.section.originalLine) || 'Section'}
                          </Heading>
                          {group.section.originalLine && group.section.originalLine !== group.section.description && !collapsedSections[groupIndex] && (
                            <Text 
                              fontFamily="$mono"
                              fontSize="$xs"
                              color="$textLight400"
                            >
                              {cleanSectionText(group.section.originalLine)}
                            </Text>
                          )}
                        </Box>
                      </HStack>
                      <Badge 
                        variant="outline" 
                        size="sm" 
                        action="muted"
                      >
                        <BadgeText>{group.variables.length} items</BadgeText>
                      </Badge>
                    </HStack>
                  </Pressable>
                )}
                
                {/* Variables in this section */}
                {!collapsedSections[groupIndex] && (
                  <VStack space="md">
                    {group.variables.map((variable) => {
                      const originalIndex = getOriginalIndex(variable)
                      
                      return (
                        <Box key={originalIndex}>
                          {variable.isComment ? (
                            <Box
                              as="pre"
                              fontFamily="$mono"
                              fontSize="$xs"
                              color="$textLight400"
                              m="$0"
                              sx={{
                                whiteSpace: 'pre-wrap'
                              }}
                            >
                              {variable.originalLine}
                            </Box>
                          ) : (
                            <VStack space="sm">
                              <HStack alignItems="center" space="md">
                                <Switch 
                                  value={variable.enabled}
                                  onValueChange={() => toggleVariable(originalIndex)}
                                />
                                <Text 
                                  fontFamily="$mono"
                                  fontWeight="$medium"
                                >
                                  {variable.key}
                                </Text>
                              </HStack>
                              
                              {variable.description && (
                                <Text 
                                  fontSize="$xs" 
                                  color="$textLight500" 
                                  sx={{
                                    whiteSpace: 'pre-line'
                                  }}
                                >
                                  {variable.description}
                                </Text>
                              )}
                              
                              <FormControl isDisabled={!variable.enabled}>
                                <Input>
                                  <InputField
                                    key={`input-${originalIndex}-${variable.key}`}
                                    value={variable.value || ''}
                                    onChangeText={(text) => updateVariableValue(originalIndex, text)}
                                    isDisabled={!variable.enabled}
                                    fontFamily="$mono"
                                    placeholder={`Value for ${variable.key}`}
                                  />
                                </Input>
                              </FormControl>
                            </VStack>
                          )}
                        </Box>
                      )
                    })}
                  </VStack>
                )}
              </Box>
            </Card>
          ))}
        </VStack>
      </ScrollView>
    </VStack>
  )
}

export default EnvEditor

