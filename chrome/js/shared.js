export const OPSGENIE_DOMAIN = {
    "US": "opsgenie.com",
    "EU": "eu.opsgenie.com",
}

export const defaultSettings = {
    enabled: false,
    enableNotifications: false,
    enableAlertActions: true,
    region: 'US',
    customerName: '',
    username: '',
    apiKey: '',
    query: '',
    timeInterval: 1,
    popupHeight: 300
}

export function opsgenieDomain(customerName, region) {
    const domainSuffix = customerName !== '' ? '.' : ''

    return `https://${customerName}${domainSuffix}app.${region === 'EU' ? 'eu.' : ''}opsgenie.com`
}
