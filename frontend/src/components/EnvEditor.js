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
  VStack,
  api,
  useAlert
} from '@spr-networks/plugin-ui'

const BASE = `/plugins/${api.pluginURI() || 'spr-vaultwarden'}`

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'access', label: 'Access' },
  { id: 'email', label: 'Email' },
  { id: 'advanced', label: 'Advanced' }
]

const OVERVIEW_KEYS = [
  'DOMAIN',
  'WEB_VAULT_ENABLED',
  'SIGNUPS_ALLOWED',
  'SENDS_ALLOWED'
]

const ACCESS_KEYS = [
  'SIGNUPS_ALLOWED',
  'SIGNUPS_VERIFY',
  'SIGNUPS_DOMAINS_WHITELIST',
  'INVITATIONS_ALLOWED',
  'EMAIL_CHANGE_ALLOWED',
  'EMERGENCY_ACCESS_ALLOWED',
  'PASSWORD_HINTS_ALLOWED',
  'SHOW_PASSWORD_HINT',
  'ORG_CREATION_USERS',
  'ADMIN_TOKEN'
]

const EMAIL_KEYS = [
  'SMTP_HOST',
  'SMTP_FROM',
  'SMTP_FROM_NAME',
  'SMTP_USERNAME',
  'SMTP_PASSWORD',
  'SMTP_SECURITY',
  'SMTP_PORT',
  'SMTP_TIMEOUT',
  'HELO_NAME',
  'SMTP_EMBED_IMAGES',
  'SMTP_DEBUG'
]

const FRIENDLY_COPY = {
  DOMAIN: {
    title: 'Public address',
    description: 'The exact HTTPS URL used by your Bitwarden apps and browser extensions.'
  },
  WEB_VAULT_ENABLED: {
    title: 'Web vault',
    description: 'Let users open the Vaultwarden web interface in a browser.'
  },
  SIGNUPS_ALLOWED: {
    title: 'Open registration',
    description: 'Allow anyone who can reach this server to create an account.'
  },
  SENDS_ALLOWED: {
    title: 'Bitwarden Send',
    description: 'Allow users to share encrypted text and files with Send.'
  },
  SIGNUPS_VERIFY: {
    title: 'Verify new accounts',
    description: 'Require email verification after registration. SMTP must be configured.'
  },
  SIGNUPS_DOMAINS_WHITELIST: {
    title: 'Registration domains',
    description: 'Comma-separated domains that may register even when open registration is off.'
  },
  INVITATIONS_ALLOWED: {
    title: 'Organization invitations',
    description: 'Allow organization administrators to invite additional users.'
  },
  EMAIL_CHANGE_ALLOWED: {
    title: 'Email changes',
    description: 'Allow users to change the email address on their account.'
  },
  EMERGENCY_ACCESS_ALLOWED: {
    title: 'Emergency access',
    description: 'Allow trusted contacts to request emergency vault access.'
  },
  PASSWORD_HINTS_ALLOWED: {
    title: 'Password hints',
    description: 'Allow users to store a master-password hint.'
  },
  SHOW_PASSWORD_HINT: {
    title: 'Show hints on screen',
    description: 'Expose hints without email. Avoid this on publicly reachable servers.'
  },
  ORG_CREATION_USERS: {
    title: 'Organization creators',
    description: "Use 'none', 'all', or a comma-separated list of allowed email addresses."
  },
  ADMIN_TOKEN: {
    title: 'Admin console token',
    description: 'Prefer an Argon2 PHC string. Leaving this inherited keeps the admin page disabled.'
  },
  SMTP_HOST: {
    title: 'SMTP server',
    description: 'Hostname of the mail server used for invitations and security notices.'
  },
  SMTP_FROM: {
    title: 'From address',
    description: 'Email address shown as the sender of Vaultwarden messages.'
  },
  SMTP_FROM_NAME: {
    title: 'Sender name',
    description: 'Friendly name shown next to the sender address.'
  },
  SMTP_USERNAME: {
    title: 'Username',
    description: 'SMTP account username, when authentication is required.'
  },
  SMTP_PASSWORD: {
    title: 'Password',
    description: 'SMTP account password. It is stored in the plugin configuration file.'
  },
  SMTP_SECURITY: {
    title: 'Transport security',
    description: "Use 'starttls', 'force_tls', or 'off'. STARTTLS is recommended."
  },
  SMTP_PORT: {
    title: 'SMTP port',
    description: 'Usually 587 for STARTTLS or 465 for implicit TLS.'
  },
  SMTP_TIMEOUT: {
    title: 'Connection timeout',
    description: 'Seconds to wait for the mail server before giving up.'
  },
  HELO_NAME: {
    title: 'HELO name',
    description: 'Optional hostname presented to the SMTP server.'
  },
  SMTP_EMBED_IMAGES: {
    title: 'Embed email images',
    description: 'Attach branded images so messages render without remote image loading.'
  },
  SMTP_DEBUG: {
    title: 'SMTP debug logging',
    description: 'Troubleshooting only. Logs can include sensitive mail details.'
  }
}

const SECRET_KEYS = /(?:PASSWORD|TOKEN|SECRET|SKEY|API_KEY|INSTALLATION_KEY)$/

const cloneVariables = (variables) => variables.map((variable) => ({ ...variable }))

const normalizeVariables = (variables = []) =>
  variables
    .map((variable) => ({
      ...variable,
      value: variable.value !== undefined ? variable.value : ''
    }))
    .filter((variable) => {
      if (variable.isComment) return variable.originalLine !== undefined
      if (variable.isSection) return !!(variable.description || variable.originalLine)
      return !!variable.key
    })

const cleanSectionText = (text) =>
  (text || '').replace(/^##\s*/, '').trim() || 'General'

const humanizeKey = (key = '') =>
  key
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

const shortDescription = (description = '') => {
  const text = description
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
  if (text.length <= 220) return text
  return `${text.slice(0, 217)}…`
}

const formatBytes = (bytes) => {
  if (!bytes) return '0 KB'
  return `${(bytes / 1024).toFixed(1)} KB`
}

const groupVariablesBySection = (variables) => {
  const groups = []
  let current = { title: 'General', entries: [] }

  variables.forEach((variable, index) => {
    if (variable.isSection) {
      if (current.entries.length) groups.push(current)
      current = {
        title: cleanSectionText(variable.description || variable.originalLine),
        entries: []
      }
      return
    }
    if (!variable.isComment && variable.key) {
      current.entries.push({ variable, index })
    }
  })

  if (current.entries.length) groups.push(current)
  return groups
}

const TabRow = ({ active, onChange }) => (
  <HStack
    space="xs"
    p="$1"
    borderRadius="$xl"
    borderWidth={1}
    borderColor="$borderColorCardLight"
    bg="$backgroundCardLight"
    alignSelf="flex-start"
    flexWrap="wrap"
    sx={{ _dark: { bg: '$backgroundCardDark', borderColor: '$borderColorCardDark' } }}
  >
    {TABS.map((tab) => {
      const selected = tab.id === active
      return (
        <Pressable
          key={tab.id}
          onPress={() => onChange(tab.id)}
          px="$3"
          py="$2"
          borderRadius="$lg"
          bg={selected ? '$primary600' : 'transparent'}
          sx={{ _dark: { bg: selected ? '$primary500' : 'transparent' } }}
          accessibilityRole="tab"
          accessibilityState={{ selected }}
        >
          <Text
            size="sm"
            fontWeight={selected ? '$semibold' : '$normal'}
            color={selected ? '$white' : '$muted500'}
          >
            {tab.label}
          </Text>
        </Pressable>
      )
    })}
  </HStack>
)

const ReadinessRow = ({ ready, warn = false, title, detail }) => (
  <HStack alignItems="center" space="md" py="$2.5">
    <StatusDot online={ready} warn={!ready && warn} />
    <VStack space="xs" flex={1}>
      <Text size="sm" fontWeight="$semibold">
        {title}
      </Text>
      <Text size="xs" color="$muted500">
        {detail}
      </Text>
    </VStack>
  </HStack>
)

const ConfigRow = ({ entry, copy, onChange, onReset, last = false }) => {
  const { variable } = entry
  const friendly = copy || {}
  const boolean = /^(true|false)$/i.test(String(variable.value).trim())
  const booleanValue = String(variable.value).toLowerCase() === 'true'
  const description = friendly.description || shortDescription(variable.description)
  const title = friendly.title || humanizeKey(variable.key)

  return (
    <Box
      py="$4"
      borderBottomWidth={last ? 0 : 1}
      borderColor="$borderColorCardLight"
      sx={{ _dark: { borderColor: '$borderColorCardDark' } }}
    >
      <HStack alignItems="flex-start" justifyContent="space-between" gap="$4" flexWrap="wrap">
        <VStack space="xs" flex={1} minWidth={220}>
          <HStack space="sm" alignItems="center" flexWrap="wrap">
            <Text fontWeight="$semibold">{title}</Text>
            <Badge
              size="sm"
              variant="outline"
              action={variable.enabled ? 'info' : 'muted'}
              borderRadius="$full"
            >
              <BadgeText>{variable.enabled ? 'Custom' : 'Inherited'}</BadgeText>
            </Badge>
          </HStack>
          {description ? (
            <Text size="xs" color="$muted500" lineHeight="$sm">
              {description}
            </Text>
          ) : null}
          <Text size="2xs" color="$muted400" fontFamily="$mono">
            {variable.key}
          </Text>
        </VStack>

        <VStack space="sm" minWidth={boolean ? 150 : 260} flex={boolean ? 0 : 1}>
          {boolean ? (
            <HStack alignItems="center" justifyContent="flex-end" space="sm">
              <Text size="sm" color="$muted500">
                {booleanValue ? 'On' : 'Off'}
              </Text>
              <Toggle
                value={booleanValue}
                onPress={() => onChange(entry.index, {
                  value: booleanValue ? 'false' : 'true',
                  enabled: true
                })}
                label={`${title}: ${booleanValue ? 'on' : 'off'}`}
              />
            </HStack>
          ) : (
            <Input
              borderRadius="$xl"
              borderColor={variable.enabled ? '$primary300' : '$muted300'}
              bg="$backgroundContentLight"
              sx={{ _dark: { bg: '$backgroundContentDark', borderColor: variable.enabled ? '$primary700' : '$muted700' } }}
            >
              <InputField
                value={variable.value || ''}
                type={SECRET_KEYS.test(variable.key) ? 'password' : 'text'}
                onChangeText={(value) => onChange(entry.index, { value, enabled: true })}
                placeholder={`Set ${title.toLowerCase()}`}
                fontFamily={variable.key === 'DOMAIN' ? '$body' : '$mono'}
              />
            </Input>
          )}
          {variable.enabled ? (
            <Button size="xs" variant="link" alignSelf="flex-end" onPress={() => onReset(entry.index)}>
              <ButtonText>Use Vaultwarden default</ButtonText>
            </Button>
          ) : !boolean ? (
            <Button size="xs" variant="link" alignSelf="flex-end" onPress={() => onChange(entry.index, { enabled: true })}>
              <ButtonText>Use this value</ButtonText>
            </Button>
          ) : null}
        </VStack>
      </HStack>
    </Box>
  )
}

const SettingsCard = ({ title, description, entries, onChange, onReset }) => (
  <Card>
    <SectionHeader title={title} count={entries.length} />
    {description ? (
      <Text size="sm" color="$muted500" mb="$2">
        {description}
      </Text>
    ) : null}
    {entries.map((entry, index) => (
      <ConfigRow
        key={`${entry.variable.key}-${entry.index}`}
        entry={entry}
        copy={FRIENDLY_COPY[entry.variable.key]}
        onChange={onChange}
        onReset={onReset}
        last={index === entries.length - 1}
      />
    ))}
  </Card>
)

export default function EnvEditor() {
  const alert = useAlert()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [envVars, setEnvVars] = useState([])
  const [filePath, setFilePath] = useState('')
  const [notice, setNotice] = useState(null)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('overview')
  const [sslStatus, setSSLStatus] = useState({ cert: { exists: false }, key: { exists: false } })
  const [selectedFiles, setSelectedFiles] = useState({ cert: '', key: '' })
  const [uploading, setUploading] = useState({ cert: false, key: false })
  const [deleting, setDeleting] = useState({ cert: false, key: false })
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [advancedSearch, setAdvancedSearch] = useState('')
  const [advancedSection, setAdvancedSection] = useState('')
  const baseline = useRef([])
  const certFileRef = useRef(null)
  const keyFileRef = useRef(null)

  const setLoadedVariables = useCallback((data) => {
    const processed = normalizeVariables(data.variables)
    setEnvVars(processed)
    baseline.current = cloneVariables(processed)
    setFilePath(data.filePath || '')
  }, [])

  const refresh = useCallback(async ({ initial = false } = {}) => {
    if (initial) setLoading(true)
    else setRefreshing(true)
    setError(null)

    const [envResult, sslResult] = await Promise.allSettled([
      api.get(`${BASE}/api/env`),
      api.get(`${BASE}/api/ssl/status`)
    ])

    if (envResult.status === 'fulfilled') {
      setLoadedVariables(envResult.value)
    } else {
      setError(`Could not load Vaultwarden settings (${envResult.reason?.message || 'backend unavailable'}).`)
    }
    if (sslResult.status === 'fulfilled') setSSLStatus(sslResult.value)

    setLoading(false)
    setRefreshing(false)
  }, [setLoadedVariables])

  useEffect(() => {
    refresh({ initial: true })
  }, [refresh])

  const groups = useMemo(() => groupVariablesBySection(envVars), [envVars])
  const configEntries = useMemo(() => groups.flatMap((group) => group.entries), [groups])
  const snapshot = useMemo(
    () => JSON.stringify(envVars.map(({ key, value, enabled, isComment, isSection, originalLine, description }) => ({
      key, value, enabled, isComment, isSection, originalLine, description
    }))),
    [envVars]
  )
  const baselineSnapshot = JSON.stringify(baseline.current.map(({ key, value, enabled, isComment, isSection, originalLine, description }) => ({
    key, value, enabled, isComment, isSection, originalLine, description
  })))
  const dirty = snapshot !== baselineSnapshot

  useEffect(() => {
    if (!advancedSection && groups.length) setAdvancedSection(groups[0].title)
  }, [advancedSection, groups])

  const findEntry = useCallback((key) => {
    const index = envVars.findIndex((variable) => !variable.isComment && !variable.isSection && variable.key === key)
    return index >= 0 ? { variable: envVars[index], index } : null
  }, [envVars])

  const entriesFor = (keys) => keys.map(findEntry).filter(Boolean)

  const updateVariable = (index, patch) => {
    setEnvVars((current) => current.map((variable, variableIndex) =>
      variableIndex === index ? { ...variable, ...patch } : variable
    ))
  }

  const resetVariable = (index) => updateVariable(index, { enabled: false })

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setNotice(null)
    try {
      const payload = {
        variables: envVars.map(({ key, value, enabled, isComment, isSection, originalLine, description }) => ({
          key, value, enabled, isComment, isSection, originalLine, description
        }))
      }
      const response = await api.put(`${BASE}/api/env`, payload)
      const processed = normalizeVariables(response.variables || envVars)
      setEnvVars(processed)
      baseline.current = cloneVariables(processed)
      if (response.filePath) setFilePath(response.filePath)
      setNotice({ type: 'success', message: 'Settings applied. Vaultwarden has been restarted.' })
      alert.success('Vaultwarden settings applied')
    } catch (err) {
      const message = `Could not apply settings (${err?.message || 'request failed'}).`
      setNotice({ type: 'error', message })
      alert.error('Failed to apply Vaultwarden settings', err)
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    setEnvVars(cloneVariables(baseline.current))
    setNotice(null)
  }

  const uploadFile = async (fileType) => {
    if (dirty) {
      setNotice({ type: 'error', message: 'Apply or discard configuration changes before changing TLS files.' })
      return
    }
    const fileInput = fileType === 'cert' ? certFileRef.current : keyFileRef.current
    const file = fileInput?.files?.[0]
    if (!file) {
      setNotice({ type: 'error', message: `Choose a ${fileType === 'cert' ? 'certificate' : 'private key'} file first.` })
      return
    }

    const allowed = ['.pem', '.crt', '.cer', '.der', '.key', '.p12', '.pfx']
    if (!allowed.some((extension) => file.name.toLowerCase().endsWith(extension))) {
      setNotice({ type: 'error', message: `Unsupported file. Use ${allowed.join(', ')}.` })
      return
    }

    setUploading((current) => ({ ...current, [fileType]: true }))
    setNotice(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
      await api.put(`${BASE}/api/ssl/upload?type=${fileType}`, {
        filename: file.name,
        fileData: btoa(binary),
        size: file.size
      })
      if (fileInput) fileInput.value = ''
      setSelectedFiles((current) => ({ ...current, [fileType]: '' }))
      await refresh()
      const label = fileType === 'cert' ? 'Certificate' : 'Private key'
      setNotice({ type: 'success', message: `${label} uploaded successfully.` })
      alert.success(`${label} uploaded`)
    } catch (err) {
      setNotice({ type: 'error', message: `Upload failed (${err?.message || 'request failed'}).` })
      alert.error('TLS upload failed', err)
    } finally {
      setUploading((current) => ({ ...current, [fileType]: false }))
    }
  }

  const deleteFile = async (fileType) => {
    setDeleteTarget(null)
    setDeleting((current) => ({ ...current, [fileType]: true }))
    try {
      await api.delete(`${BASE}/api/ssl/delete?type=${fileType}`)
      await refresh()
      const label = fileType === 'cert' ? 'Certificate' : 'Private key'
      setNotice({ type: 'success', message: `${label} removed.` })
      alert.success(`${label} removed`)
    } catch (err) {
      setNotice({ type: 'error', message: `Could not remove file (${err?.message || 'request failed'}).` })
      alert.error('Could not remove TLS file', err)
    } finally {
      setDeleting((current) => ({ ...current, [fileType]: false }))
    }
  }

  if (loading) {
    return <Page><Loading text="Loading Vaultwarden…" /></Page>
  }

  if (error) {
    return (
      <Page>
        <ListHeader title="Vaultwarden" description="Private password management on SPR" mark="vw" status="Unavailable" statusAction="error" />
        <Card>
          <VStack space="md" alignItems="flex-start">
            <SectionHeader title="Backend unavailable" right={<StatusDot />} />
            <Text size="sm" color="$muted500">{error}</Text>
            <Button size="sm" onPress={() => refresh({ initial: true })}>
              <ButtonText>Try again</ButtonText>
            </Button>
          </VStack>
        </Card>
      </Page>
    )
  }

  const tlsFiles = Number(!!sslStatus.cert?.exists) + Number(!!sslStatus.key?.exists)
  const configuredCount = configEntries.filter(({ variable }) => variable.enabled).length
  const domain = findEntry('DOMAIN')
  const smtpHost = findEntry('SMTP_HOST')
  const signups = findEntry('SIGNUPS_ALLOWED')
  const rocketTLS = findEntry('ROCKET_TLS')
  const publicDomainReady = !!domain?.variable.enabled && /^https:\/\//i.test(domain.variable.value)
  const emailReady = !!smtpHost?.variable.enabled && !!smtpHost.variable.value
  const registrationsClosed = !!signups?.variable.enabled && signups.variable.value === 'false'
  const directTLSReady = tlsFiles === 2 && !!rocketTLS?.variable.enabled
  const configurationSource = filePath === '/configs/.env'
    ? 'Saved configuration'
    : 'Built-in defaults'
  const query = advancedSearch.trim().toLowerCase()
  const searchResults = query
    ? configEntries.filter(({ variable }) =>
      `${variable.key} ${variable.description || ''}`.toLowerCase().includes(query)
    ).slice(0, 60)
    : []
  const selectedGroup = groups.find((group) => group.title === advancedSection) || groups[0]

  const renderTLSFile = (fileType, label, inputRef) => {
    const file = sslStatus[fileType] || {}
    const selected = selectedFiles[fileType]
    return (
      <Box
        flex={1}
        minWidth={260}
        p="$4"
        borderRadius="$xl"
        borderWidth={1}
        borderColor={file.exists ? '$green200' : '$borderColorCardLight'}
        bg="$backgroundContentLight"
        sx={{ _dark: { bg: '$backgroundContentDark', borderColor: file.exists ? '$green800' : '$borderColorCardDark' } }}
      >
        <HStack justifyContent="space-between" alignItems="center" mb="$3" gap="$2">
          <HStack alignItems="center" space="sm">
            <StatusDot online={file.exists} />
            <Text fontWeight="$semibold">{label}</Text>
          </HStack>
          <Badge variant="outline" action={file.exists ? 'success' : 'muted'} borderRadius="$full">
            <BadgeText>{file.exists ? 'Installed' : 'Missing'}</BadgeText>
          </Badge>
        </HStack>

        <VStack space="xs" minHeight={50}>
          <Text size="sm" fontFamily="$mono" color={file.exists || selected ? '$textLight900' : '$muted400'} sx={{ _dark: { color: file.exists || selected ? '$textDark100' : '$muted500' } }}>
            {selected || file.name || 'No file selected'}
          </Text>
          {file.exists ? (
            <Text size="xs" color="$muted500">{formatBytes(file.size)} · updated {file.modTime}</Text>
          ) : (
            <Text size="xs" color="$muted500">PEM, CRT, CER, DER, KEY, P12, or PFX</Text>
          )}
        </VStack>

        <input
          ref={inputRef}
          type="file"
          accept=".pem,.crt,.cer,.der,.key,.p12,.pfx"
          style={{ display: 'none' }}
          onChange={(event) => setSelectedFiles((current) => ({
            ...current,
            [fileType]: event.target.files?.[0]?.name || ''
          }))}
        />
        <HStack space="sm" mt="$4" flexWrap="wrap">
          <Button size="xs" variant="outline" onPress={() => inputRef.current?.click()}>
            <ButtonText>Choose file</ButtonText>
          </Button>
          <Button size="xs" isDisabled={!selected || uploading[fileType] || dirty} onPress={() => uploadFile(fileType)}>
            {uploading[fileType] ? <Spinner size="small" color="$white" /> : <ButtonText>Upload</ButtonText>}
          </Button>
          {file.exists ? (
            <Button size="xs" variant="link" action="negative" isDisabled={deleting[fileType] || dirty} onPress={() => setDeleteTarget(fileType)}>
              <ButtonText>Remove</ButtonText>
            </Button>
          ) : null}
        </HStack>
      </Box>
    )
  }

  return (
    <Page>
      <ListHeader
        title="Vaultwarden"
        description="Private password management on SPR"
        mark="vw"
        status={dirty ? 'Unsaved changes' : 'Connected'}
        statusAction={dirty ? 'warning' : 'success'}
      >
        <Button size="sm" variant="outline" isDisabled={refreshing || dirty} onPress={() => refresh()}>
          <ButtonText>{refreshing ? 'Refreshing…' : 'Refresh'}</ButtonText>
        </Button>
        <Button size="sm" isDisabled={!dirty || saving} onPress={save}>
          {saving ? <Spinner size="small" color="$white" /> : <ButtonText>Apply changes</ButtonText>}
        </Button>
      </ListHeader>

      <TabRow active={tab} onChange={setTab} />

      {notice ? (
        <Alert action={notice.type === 'error' ? 'error' : 'success'} variant="solid" borderRadius="$xl">
          <AlertIcon />
          <Text color="$white">{notice.message}</Text>
        </Alert>
      ) : null}

      {tab === 'overview' ? (
        <>
          <Card
            sx={{
              '@base': { backgroundImage: 'linear-gradient(135deg, rgba(30,64,175,0.055), rgba(255,255,255,0) 62%)' },
              _dark: { backgroundImage: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(0,0,0,0) 62%)' }
            }}
          >
            <SectionHeader title="Deployment" right={<StatusDot online={directTLSReady} warn={tlsFiles > 0} />} />
            <HStack flexWrap="wrap" gap="$2">
              <StatTile label="Configuration" value={`${configuredCount} custom`} />
              <StatTile label="Direct TLS" value={directTLSReady ? 'Ready' : tlsFiles === 2 ? 'Needs enabling' : tlsFiles === 1 ? 'Incomplete' : 'Not configured'} />
              <StatTile label="Registration" value={registrationsClosed ? 'Invite only' : 'Open / inherited'} />
              <StatTile label="Email" value={emailReady ? 'Configured' : 'Not configured'} />
            </HStack>
            <VStack mt="$4" space="xs">
              <KeyVal label="Configuration source" value={configurationSource} />
              <KeyVal label="Service port" value="8989" mono />
            </VStack>
          </Card>

          <HStack gap="$4" alignItems="stretch" flexWrap="wrap">
            <Card flex={1} minWidth={290}>
              <SectionHeader title="Launch checklist" />
              <ReadinessRow
                ready={publicDomainReady}
                warn={!publicDomainReady}
                title="Set the public HTTPS address"
                detail={publicDomainReady ? domain.variable.value : 'Required for attachments, links, and client security features.'}
              />
              <ReadinessRow
                ready={directTLSReady}
                warn={tlsFiles > 0}
                title="Secure the connection"
                detail={directTLSReady ? 'Certificate, private key, and ROCKET_TLS are configured.' : tlsFiles === 2 ? 'Files are installed. Enable ROCKET_TLS under Advanced → Rocket settings.' : 'Upload both files below, or terminate TLS at a trusted reverse proxy.'}
              />
              <ReadinessRow
                ready={registrationsClosed}
                warn={!registrationsClosed}
                title="Review who can register"
                detail={registrationsClosed ? 'Open registration is explicitly disabled.' : 'The inherited Vaultwarden default allows registration.'}
              />
              <ReadinessRow
                ready={emailReady}
                title="Connect an email server"
                detail={emailReady ? `Mail is configured through ${smtpHost.variable.value}.` : 'Optional, but needed for invitations, verification, and alerts.'}
              />
            </Card>

            <Card flex={1.35} minWidth={340}>
              <SectionHeader title="Essential settings" />
              <Text size="sm" color="$muted500" mb="$2">
                Start here. Changes are staged until you select Apply changes.
              </Text>
              {entriesFor(OVERVIEW_KEYS).map((entry, index, entries) => (
                <ConfigRow
                  key={`${entry.variable.key}-${entry.index}`}
                  entry={entry}
                  copy={FRIENDLY_COPY[entry.variable.key]}
                  onChange={updateVariable}
                  onReset={resetVariable}
                  last={index === entries.length - 1}
                />
              ))}
            </Card>
          </HStack>

          <Card>
            <SectionHeader title="Direct TLS" right={<StatusDot online={directTLSReady} warn={tlsFiles > 0} />} />
            <Text size="sm" color="$muted500" mb="$4">
              Bitwarden clients require a trusted HTTPS connection. Upload a matching certificate and key, then enable ROCKET_TLS under Advanced → Rocket settings. Save pending settings first.
            </Text>
            <HStack gap="$3" flexWrap="wrap">
              {renderTLSFile('cert', 'Certificate', certFileRef)}
              {renderTLSFile('key', 'Private key', keyFileRef)}
            </HStack>
          </Card>
        </>
      ) : null}

      {tab === 'access' ? (
        <SettingsCard
          title="Accounts and access"
          description="Common account policies in one place. Inherited settings follow Vaultwarden's built-in defaults."
          entries={entriesFor(ACCESS_KEYS)}
          onChange={updateVariable}
          onReset={resetVariable}
        />
      ) : null}

      {tab === 'email' ? (
        <>
          <Card tone={emailReady ? 'default' : 'warning'}>
            <SectionHeader title={emailReady ? 'Email delivery configured' : 'Email delivery is optional'} right={<StatusDot online={emailReady} warn={!emailReady} />} />
            <Text size="sm" color="$muted500">
              Email enables invitations, account verification, emergency access, and security notifications. Use a dedicated SMTP credential when possible.
            </Text>
          </Card>
          <SettingsCard
            title="SMTP delivery"
            entries={entriesFor(EMAIL_KEYS)}
            onChange={updateVariable}
            onReset={resetVariable}
          />
        </>
      ) : null}

      {tab === 'advanced' ? (
        <>
          <Card>
            <HStack alignItems="center" justifyContent="space-between" gap="$4" flexWrap="wrap">
              <VStack space="xs" flex={1} minWidth={240}>
                <Heading size="md">Advanced configuration</Heading>
                <Text size="sm" color="$muted500">
                  Browse one category at a time, or search every Vaultwarden setting.
                </Text>
              </VStack>
              <Input minWidth={280} flex={1} maxWidth={440} borderRadius="$xl" bg="$backgroundContentLight" sx={{ _dark: { bg: '$backgroundContentDark' } }}>
                <InputField value={advancedSearch} onChangeText={setAdvancedSearch} placeholder="Search settings…" />
              </Input>
            </HStack>
          </Card>

          {query ? (
            <SettingsCard
              title={`Results for “${advancedSearch.trim()}”`}
              description={searchResults.length === 60 ? 'Showing the first 60 matches. Refine your search to narrow the list.' : `${searchResults.length} matching settings`}
              entries={searchResults}
              onChange={updateVariable}
              onReset={resetVariable}
            />
          ) : (
            <HStack gap="$4" alignItems="flex-start" flexWrap="wrap">
              <Card p="$2" minWidth={230} flexBasis={250} flexGrow={0}>
                <VStack space="xs">
                  {groups.map((group) => {
                    const selected = group.title === selectedGroup?.title
                    const custom = group.entries.filter(({ variable }) => variable.enabled).length
                    return (
                      <Pressable
                        key={group.title}
                        onPress={() => setAdvancedSection(group.title)}
                        px="$3"
                        py="$2.5"
                        borderRadius="$lg"
                        bg={selected ? '$backgroundContentLight' : 'transparent'}
                        sx={{ _dark: { bg: selected ? '$backgroundContentDark' : 'transparent' } }}
                      >
                        <HStack alignItems="center" justifyContent="space-between" gap="$3">
                          <Text size="sm" fontWeight={selected ? '$semibold' : '$normal'} color={selected ? '$primary700' : '$textLight900'} sx={{ _dark: { color: selected ? '$primary300' : '$textDark100' } }} flex={1}>
                            {group.title}
                          </Text>
                          <Badge size="sm" variant="outline" action={custom ? 'info' : 'muted'} borderRadius="$full">
                            <BadgeText>{custom || group.entries.length}</BadgeText>
                          </Badge>
                        </HStack>
                      </Pressable>
                    )
                  })}
                </VStack>
              </Card>

              {selectedGroup ? (
                <Box flex={1} minWidth={360}>
                  <SettingsCard
                    title={selectedGroup.title}
                    description={`${selectedGroup.entries.filter(({ variable }) => variable.enabled).length} custom overrides · ${selectedGroup.entries.length} available settings`}
                    entries={selectedGroup.entries}
                    onChange={updateVariable}
                    onReset={resetVariable}
                  />
                </Box>
              ) : null}
            </HStack>
          )}
        </>
      ) : null}

      {dirty ? (
        <Card
          p="$3"
          borderColor="$primary200"
          sx={{
            '@base': { position: 'sticky', bottom: 12, zIndex: 20, boxShadow: '0 14px 36px rgba(15,23,42,0.16)' },
            _dark: { borderColor: '$primary800' }
          }}
        >
          <HStack alignItems="center" justifyContent="space-between" gap="$3" flexWrap="wrap">
            <HStack alignItems="center" space="sm">
              <StatusDot warn />
              <VStack space="xs">
                <Text size="sm" fontWeight="$semibold">You have unapplied changes</Text>
                <Text size="xs" color="$muted500">Applying restarts Vaultwarden once.</Text>
              </VStack>
            </HStack>
            <HStack space="sm">
              <Button size="sm" variant="outline" isDisabled={saving} onPress={discard}>
                <ButtonText>Discard</ButtonText>
              </Button>
              <Button size="sm" isDisabled={saving} onPress={save}>
                {saving ? <Spinner size="small" color="$white" /> : <ButtonText>Apply changes</ButtonText>}
              </Button>
            </HStack>
          </HStack>
        </Card>
      ) : null}

      <ModalConfirm
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteFile(deleteTarget)}
        title={`Remove ${deleteTarget === 'cert' ? 'certificate' : 'private key'}?`}
        message="Direct TLS will be unavailable until a matching replacement is installed."
        confirmText="Remove file"
        destructive
      />
    </Page>
  )
}
