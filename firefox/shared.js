export const OPSGENIE_DOMAIN = {
    "US": "opsgenie.com",
    "EU": "eu.opsgenie.com",
}

export const defaultSettings = {
    enabled: false,
    enableNotifications: false,
    region: 'US',
    customerName: '',
    username: '',
    apiKey: '',
    query: '',
    timeInterval: 1,
    popupHeight: 300
}

export function opsgenieDomain(customerName) {
    const domainSuffix = customerName !== '' ? '.' : ''

    return `https://${customerName}${domainSuffix}app.opsgenie.com`
}
