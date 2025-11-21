
import axios from 'axios';

const TOKEN = 'EAAYl7gsCHoQBO5uHb4HvFXM0S3czUMZCTyPomIKw5iTDZBzfD8EODwZB20l2zMqGW3QrHMwdxR6WnyT7Pq85RTOVLhloqgkyUIJpTCIMQQso25LZA7DOWAhI2IkoHu0KJOJcfNq5JDtqA3oX6k3kjRBOyvywThOwSPRbiGnKzSdU7ZCm532mald7X3v0zpiEjBQZDZD';

async function debugToken() {
    try {
        const response = await axios.get('https://graph.facebook.com/v19.0/debug_token', {
            params: {
                input_token: TOKEN,
                access_token: TOKEN,
            },
        });

        console.log('Token Debug Info:', JSON.stringify(response.data, null, 2));
    } catch (error: any) {
        console.error('Error debugging token:', error.response?.data || error.message);
    }
}

debugToken();
