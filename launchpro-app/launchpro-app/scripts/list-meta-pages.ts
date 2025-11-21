
import axios from 'axios';

const META_ACCESS_TOKEN_MAPPING: { [key: string]: string } = {
    'Quick Enterprise LLC - H (RSOC Tonic)': 'EAAYl7gsCHoQBO5uHb4HvFXM0S3czUMZCTyPomIKw5iTDZBzfD8EODwZB20l2zMqGW3QrHMwdxR6WnyT7Pq85RTOVLhloqgkyUIJpTCIMQQso25LZA7DOWAhI2IkoHu0KJOJcfNq5JDtqA3oX6k3kjRBOyvywThOwSPRbiGnKzSdU7ZCm532mald7X3v0zpiEjBQZDZD',
    'Quick Enterprise LLC - X (RSOC Tonic)': 'EAAYl7gsCHoQBOyLePTu9YGoP5oxZCIVW25xphvSsHplE5NGJ5iCen8k2EUdh4W8PQChdH8hrfcEWZCWwrmGtBlblmkIKzbmgvOfIRTJUJtkv41bmjhDxnEKc5sOBCKzPFnzLw2c5AiqFvZAaYuZCQXgoxqWnhJeZBxyIfGATnBaNl31cTnM1RZBQW9iDbzFWjkZCwZDZD',
    'Quick Enterprise LLC - Q': 'EAAYl7gsCHoQBOzwsPBHfQz15ZByoM5Tb2gqqZAA2Vonxh8xZBqhav39aY8YRt9fdckRDCFSahv9g1VZAZAYPgYZAZCjvyRuN8uBfOrVkGeaD3Kg1RKdZCb3nRKPppgNjDKLf5TCGfZAZAcz86ydf71P0zqwXxgEdXdkOyHei8AZCzmxW4LFgagvh0nxDNZA619ym9NAXFwZDZD',
    'Quick Enterprise LLC - Y (Rsoc Tonic)': 'EAAYl7gsCHoQBO1rJjzTkPmehaQaXd4yuSlcFQqo9wicerpGnmxwbGQNfQr0AKdwiBq5suGUxRsPLBAcLEY2NeJ5VQEvZANpLmdx2KWiOrE6ujdJqQGNbspu2O3OtJoruFE44qN77Nu8fR5NWC9maP5OSWbyXJznieeSddXgj6VjLjwmtvML4eBdoKyngjBAZDZD',
    'Quick Enterprise LLC - S': 'EAAYl7gsCHoQBO8UAm6VXlDRvU7ZClNXtZBrvnUWGLO0DvxJvk7vqGGCJRHM1Gq65XFZBxKTMWwVOOuSWiHshbZAvZCZAZA0nlEkbFeAaMMZC7xklFvHoEDcI7wtP6S34CmVFcLPi2WSo06DZCD9QAW3OCY7sfnIwLFDjoRTdMoOAc2V1OxNsxA1OccDjow9XEcUlGNQZDZD',
    'Quick Enterprise LLC - Z': 'EAAYl7gsCHoQBO5ZBu350MRWaZBWDigenBWmLfiN9BCZCjZAu5CNYvx7gw2mIBtcvQZC4LnzePD1dzoScQkIWkZB81SouVQcu4jFFTND85mE1MQEkMnc97V6mLNdZB2Jj0ZCmQmSCRrL6UaHDZCOw2vVuJYrgOZBVDHqbKh2VzGbhk8sWEBJfm3k8BMLgMQ9BGNy4F0bgZDZD',
    'Capital Quick LLC - A1': 'EABZB8DcFpOfsBOynXLGBDvWfGotmCDsrwHy2eaM3h5dbpVkHzg3vUMKmT481gRJlNa7bVRm1yE7ZA3M049Se5wrE0YSvPRDGQeaewl07KIK7uU1yjOolDjoJSZBn2Pno7VMZB2fmPhQH7rux8iITnSVp49Vhf8tYZBWgWqgEFzdWVizYHgBoZChHTi76u68jEVYgZDZD',
    'Capital Quick LLC - B1 - Rsoc Tonic': 'EABZB8DcFpOfsBO8Vkz5gBxmH9wIkH7CcPxgr9ZAbfF5lhslhfDZBRu7F9L5ZCIWS1H7jlFM3Mef7cRaZBg0IuR2aNo9BOA3HvWECyXHuDV2gEnVRS1aCzQmGV4LFvF6aOyjnyMcJFZBMZAq9iKCj6fmcmdqD25CIkwfvI1Kud269QIxZA0vreVbqUmIUA0XZAxMsmbQZDZD',
    'Global Qreate - L2 - Loans': 'EAAJRmTwhsNgBO1OnDiD8eS4vZB2m1JGFUZAi9ErzWUBlV0hPtuoNZCL6TBADDy6jXAbd0lvc0RiZCOxrK991pcuW8b519EnhrpPKt4ZBTLLmUYMkkV4LZCYx1GAkU0uhBbekynZBdrpE30S9Th1x1zwpIUe0OACto0iKDZCFzfd6OBZCZBZBSRcPxZBMGrNZA4BOlqUrUAQZDZD',
    'Global Qreate - Inforproductos': 'EABZB8DcFpOfsBO6vHZBiXZBgo2LtZCjEpt0qOyQGvxxIN0LgOXp6vxU9VTUQmwkzMnevZAv5LnE2UKFNxhITNZAJb5Crt3tUcNZBREinKrlU4cf29T6hIqxPAZCfKbjbQLRoWO5zkZAZC3Axshd8jstZBnDCwFLjZAd9oWQ9bwCHReODOWltyJVZAudg2PkyDSOS6PXwknwZDZD',
    'B3': 'EAADuOFCzsHsBPPOGO8j4fzZBKy4BRViYTWiPiCZChKNAQ3sWVhWlTvTp267FXnLEzHgwEEMbWxoUz9fbQKBWaWP2iOSGbM00o3091hARmTf0QTlgPYbpt9a52cqNIxXMEBNx02YL2xzq0sSdepJzPTQ3IQ4a9OU0KEoGZBZAv7ul23HtpwoS5xaWSWCt4kmtGwZDZD',
};

async function getPagesForToken(name: string, token: string) {
    try {
        const response = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
            params: {
                access_token: token,
                fields: 'id,name,instagram_business_account',
            },
        });

        console.log(`\n--- Pages for ${name} ---`);
        if (response.data.data && response.data.data.length > 0) {
            response.data.data.forEach((page: any) => {
                console.log(`Page Name: ${page.name}`);
                console.log(`Page ID: ${page.id}`);
                if (page.instagram_business_account) {
                    console.log(`Instagram ID: ${page.instagram_business_account.id}`);
                } else {
                    console.log('Instagram ID: Not connected');
                }
                console.log('---');
            });
        } else {
            console.log('No pages found.');
        }
    } catch (error: any) {
        console.error(`Error fetching pages for ${name}:`, error.response?.data?.error?.message || error.message);
    }
}

async function main() {
    console.log('Fetching pages for all accounts...');

    // Get unique tokens to avoid redundant calls
    const uniqueTokens = new Map<string, string>();
    for (const [name, token] of Object.entries(META_ACCESS_TOKEN_MAPPING)) {
        if (!uniqueTokens.has(token)) {
            uniqueTokens.set(token, name);
        }
    }

    for (const [token, name] of uniqueTokens.entries()) {
        await getPagesForToken(name, token);
    }
}

main();
