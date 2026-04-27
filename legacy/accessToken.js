function getAccessToken() {
  const clientId = PropertiesService.getScriptProperties().getProperty('ID_CLIENTE');
  const clientSecret = PropertiesService.getScriptProperties().getProperty('SECRETO_CLIENTE');

  const tokenUrl = 'https://mvdapi-auth.montevideo.gub.uy/auth/realms/pci/protocol/openid-connect/token';

  const payload = {
    'grant_type': 'client_credentials',
    'client_id': clientId,
    'client_secret': clientSecret
  };

  const options = {
    'method': 'post',
    'payload': payload
  };

  try {
    const response = UrlFetchApp.fetch(tokenUrl, options);
    const data = JSON.parse(response.getContentText());
    
    // Check if the response contains an access token
    if (data.access_token) {
      Logger.log('Access Token obtained successfully.');
      return data.access_token;
    } else {
      Logger.log('Failed to obtain access token. Response: ' + response.getContentText());
      return null;
    }
  } catch (e) {
    Logger.log('Error getting access token: ' + e.toString());
    return null;
  }
}

