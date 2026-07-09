import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AlertIcon,
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonText,
  Card,
  FormControl,
  Heading,
  HStack,
  Input,
  InputField,
  KeyVal,
  ListHeader,
  Loading,
  ModalConfirm,
  Page,
  Pressable,
  SectionHeader,
  Spinner,
  StatTile,
  StatusDot,
  Text,
  Toggle,
  ToastTitle,
  api,
  useToast,
  VStack
} from '@spr-networks/plugin-ui'

const initializeCollapsedSections = (groups) => {
  const collapsed = {}
  groups.forEach((_, index) => {
    collapsed[index] = true
  })
  return collapsed
}

const groupVariablesBySection = (variables) => {
  const groups = []
  let currentGroup = { section: null, variables: [] }

  variables.forEach((variable) => {
    if (variable.isSection) {
      if (currentGroup.variables.length > 0 || currentGroup.section) {
        groups.push(currentGroup)
      }
      currentGroup = { section: variable, variables: [] }
    } else {
      currentGroup.variables.push(variable)
    }
  })

  if (currentGroup.variables.length > 0 || currentGroup.section) {
    groups.push(currentGroup)
  }

  return groups
}

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
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [collapsedSections, setCollapsedSections] = useState({})
  const certFileRef = useRef(null)
  const keyFileRef = useRef(null)
  let pluginName = api.pluginURI() || 'spr-vaultwarden'
  const pluginURL = `/plugins/${pluginName}`
  const toast = useToast?.()

  // Fetch SSL certificate status
  const fetchSSLStatus = useCallback(async () => {
    try {
      const response = await api.get(`${pluginURL}/api/ssl/status`)
      setSSLStatus(response)
    } catch (err) {
      console.error('Error fetching SSL status:', err)
    }
  }, [pluginURL])

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
    setDeleteTarget(null)
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
  const fetchEnvVars = useCallback(() => {
    setLoading(true)
    setError(null)
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
  }, [pluginURL])

  useEffect(() => {
    fetchEnvVars()
    fetchSSLStatus()
  }, [fetchEnvVars, fetchSSLStatus])

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

  const groupedVariables = useMemo(() => groupVariablesBySection(envVars), [envVars])

  // Set default collapsed state when groups change
  useEffect(() => {
    setCollapsedSections(initializeCollapsedSections(groupedVariables))
  }, [groupedVariables])

  const configVariables = envVars.filter(variable => !variable.isComment && !variable.isSection)
  const enabledVariables = configVariables.filter(variable => variable.enabled)
  const tlsFiles = Number(!!sslStatus.cert?.exists) + Number(!!sslStatus.key?.exists)

  const renderTLSFile = (fileType, label, inputRef) => {
    const file = sslStatus[fileType] || {}
    return (
      <Box
        pt="$4"
        mt="$4"
        borderTopWidth={1}
        borderColor="$borderColorCardLight"
        sx={{ _dark: { borderColor: '$borderColorCardDark' } }}
      >
        <HStack justifyContent="space-between" alignItems="center" mb="$2" gap="$2">
          <Text fontWeight="$semibold">{label}</Text>
          <Badge
            variant="outline"
            action={file.exists ? 'success' : 'muted'}
            borderRadius="$full"
          >
            <BadgeText>{file.exists ? 'Uploaded' : 'Not uploaded'}</BadgeText>
          </Badge>
        </HStack>

        {file.exists ? (
          <HStack space="sm" flexWrap="wrap" mb="$3">
            <Text size="xs" fontFamily="$mono" color="$muted600" sx={{ _dark: { color: '$muted300' } }}>
              {file.name}
            </Text>
            <Text size="xs" color="$muted500">
              {(file.size / 1024).toFixed(1)} KB · modified {file.modTime}
            </Text>
          </HStack>
        ) : null}

        <HStack space="sm" alignItems="center" flexWrap="wrap">
          <Input
            flex={1}
            minWidth={220}
            borderRadius="$xl"
            borderColor="$muted300"
            bg="$backgroundCardLight"
            sx={{ _dark: { bg: '$backgroundCardDark', borderColor: '$muted700' } }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pem,.crt,.cer,.der,.key,.p12,.pfx"
              style={{
                width: '100%',
                padding: '8px 10px',
                color: 'inherit',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
            />
          </Input>
          <Button
            size="sm"
            onPress={() => handleFileUpload(fileType)}
            isDisabled={uploadLoading[fileType]}
            variant="outline"
          >
            {uploadLoading[fileType] ? <Spinner size="small" /> : <ButtonText>Upload</ButtonText>}
          </Button>
          {file.exists ? (
            <Button
              size="sm"
              onPress={() => setDeleteTarget(fileType)}
              isDisabled={deleteLoading[fileType]}
              variant="outline"
              action="negative"
            >
              {deleteLoading[fileType] ? <Spinner size="small" /> : <ButtonText>Delete</ButtonText>}
            </Button>
          ) : null}
        </HStack>
      </Box>
    )
  }

  if (loading) {
    return (
      <Page>
        <Loading text="Loading Vaultwarden configuration..." />
      </Page>
    )
  }

  if (error) {
    return (
      <Page>
        <ListHeader
          title="Vaultwarden"
          description="Self-hosted password vault · SPR"
          mark="vw"
          status="Unavailable"
          statusAction="error"
        />
        <Alert action="error" variant="solid" borderRadius="$xl" sx={{ bg: '$error700' }}>
          <AlertIcon />
          <Text color="$white">{error}</Text>
        </Alert>
      </Page>
    )
  }

  return (
    <Page>
      <ListHeader
        title="Vaultwarden"
        description="Self-hosted password vault · SPR"
        mark="vw"
        status={saveLoading ? 'Saving' : tlsFiles === 2 ? 'TLS ready' : tlsFiles === 1 ? 'TLS incomplete' : 'Ready'}
        statusAction={tlsFiles === 2 ? 'success' : tlsFiles === 1 ? 'warning' : 'info'}
      >
        <HStack space="sm" flexWrap="wrap">
          <Button
            size="sm"
            variant="outline"
            onPress={() => { fetchEnvVars(); fetchSSLStatus() }}
          >
            <ButtonText>Refresh</ButtonText>
          </Button>
          <Button
            size="sm"
            onPress={saveEnvVars}
            isDisabled={saveLoading}
          >
            {saveLoading ? <Spinner size="small" color="$white" /> : <ButtonText>Save</ButtonText>}
          </Button>
        </HStack>
      </ListHeader>

      {status.show && (
        <Alert
          action={status.type === 'error' ? 'error' : 'success'}
          variant="solid"
          borderRadius="$xl"
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
        <Card p="$4">
          <KeyVal label="Configuration file" value={filePath} mono />
        </Card>
      )}

      <Card>
        <SectionHeader
          title="TLS certificates"
          right={<StatusDot online={tlsFiles === 2} warn={tlsFiles === 1} />}
        />
        <Text color="$muted500" size="sm" mb="$4">
          Optional Rocket TLS credentials. Vaultwarden restarts automatically after both files are uploaded.
        </Text>
        <HStack flexWrap="wrap" gap="$2">
          <StatTile label="Certificate" value={sslStatus.cert?.exists ? 'Uploaded' : 'Missing'} />
          <StatTile label="Private key" value={sslStatus.key?.exists ? 'Uploaded' : 'Missing'} />
          <StatTile label="Configuration" value={`${enabledVariables.length} enabled`} />
        </HStack>
        {renderTLSFile('cert', 'Certificate file', certFileRef)}
        {renderTLSFile('key', 'Private key file', keyFileRef)}
        <Text size="xs" color="$muted500" mt="$3">
          Supported: .pem, .crt, .cer, .der, .key, .p12, and .pfx
        </Text>
      </Card>

      <Box>
        <SectionHeader title="Configuration" count={configVariables.length} />
        <VStack space="md">
          {groupedVariables.map((group, groupIndex) => {
            const collapsed = !!collapsedSections[groupIndex]
            const sectionTitle = group.section
              ? cleanSectionText(group.section.description) || cleanSectionText(group.section.originalLine) || 'Section'
              : 'General'
            return (
              <Card key={groupIndex} p="$0" overflow="hidden">
                <Pressable
                  onPress={() => toggleSectionCollapse(groupIndex)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !collapsed }}
                  p="$4"
                >
                  <HStack justifyContent="space-between" alignItems="center" gap="$3">
                    <HStack alignItems="center" space="md" flex={1} minWidth={0}>
                      <Box
                        w={28}
                        h={28}
                        borderRadius="$full"
                        bg="$backgroundContentLight"
                        alignItems="center"
                        justifyContent="center"
                        sx={{ _dark: { bg: '$backgroundContentDark' } }}
                      >
                        <Text color="$primary700" fontWeight="$bold" sx={{ _dark: { color: '$primary300' } }}>
                          {collapsed ? '+' : '−'}
                        </Text>
                      </Box>
                      <Heading size="sm" color="$textLight900" sx={{ _dark: { color: '$textDark50' } }}>
                        {sectionTitle}
                      </Heading>
                    </HStack>
                    <Badge variant="outline" size="sm" action="muted" borderRadius="$full">
                      <BadgeText>{group.variables.length} items</BadgeText>
                    </Badge>
                  </HStack>
                </Pressable>

                {!collapsed ? (
                  <VStack px="$4" pb="$4">
                    {group.variables.map((variable) => {
                      const originalIndex = getOriginalIndex(variable)
                      return (
                        <Box
                          key={originalIndex}
                          py="$4"
                          borderTopWidth={1}
                          borderColor="$borderColorCardLight"
                          sx={{ _dark: { borderColor: '$borderColorCardDark' } }}
                        >
                          {variable.isComment ? (
                            <Box
                              as="pre"
                              fontFamily="$mono"
                              fontSize="$xs"
                              color="$muted500"
                              m="$0"
                              sx={{ whiteSpace: 'pre-wrap' }}
                            >
                              {variable.originalLine}
                            </Box>
                          ) : (
                            <VStack space="sm">
                              <HStack alignItems="center" justifyContent="space-between" gap="$3">
                                <Text fontFamily="$mono" fontWeight="$semibold" flex={1}>
                                  {variable.key}
                                </Text>
                                <Toggle
                                  value={variable.enabled}
                                  onPress={() => toggleVariable(originalIndex)}
                                  label={`${variable.key} enabled`}
                                />
                              </HStack>
                              {variable.description ? (
                                <Text size="xs" color="$muted500" sx={{ whiteSpace: 'pre-line' }}>
                                  {variable.description}
                                </Text>
                              ) : null}
                              <FormControl isDisabled={!variable.enabled}>
                                <Input
                                  borderRadius="$xl"
                                  borderColor="$muted300"
                                  bg="$backgroundCardLight"
                                  sx={{ _dark: { bg: '$backgroundCardDark', borderColor: '$muted700' } }}
                                >
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
                ) : null}
              </Card>
            )
          })}
        </VStack>
      </Box>

      <ModalConfirm
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleFileDelete(deleteTarget)}
        title={`Delete ${deleteTarget === 'cert' ? 'certificate' : 'private key'}?`}
        message="Vaultwarden may lose TLS connectivity until a replacement file is uploaded."
        confirmText="Delete file"
        destructive
      />
    </Page>
  )
}

export default EnvEditor
