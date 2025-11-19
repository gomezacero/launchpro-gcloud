# TONIC for Publishers - API Documentation

## Feedback
Are you missing a feature?
We love feedback! TONIC. for Publishers is evolving quickly, so if you notice anything odd or feel like something's missing, don't hesitate to let us know — your input helps us improve!

You can contact our Crew support@tonic.com.

## Authentication

### Credentials
Please use the credentials from your Account Settings under https://publisher.tonic.com/privileged/account/settings when you are logged into your TONIC. for Publishers account.

Example credentials:
- Username: myUsername
- Password: myPassword

### JSON Web Token (JWT)
JSON Web Token (JWT) is an open standard (RFC 7519) that defines a compact and self-contained way for securely transmitting information between parties as a JSON object.

**Bearer Authorization Request Header:**
```
Authorization: Bearer eyJ0eXAiOsiJKV1QiLCJhbGciOiJIUI1NiJ9...
```

### JWT Authentication Steps:
1. Request a token: (JWT Authentication)
2. Start sending requests with Bearer authorization header to our API. (Header "Content-Type" must be "application/json".)
3. The JWT token has a lifetime of 90 minutes. If a token expires you need to request a new one.

For more about JWT see jwt.io

### JWT Authenticate Endpoint

**POST** `https://api.publisher.tonic.com/jwt/authenticate`

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "consumer_key": "<api-username>",
  "consumer_secret": "<api-password>"
}
```

**Response 200:**
```json
{
  "token": "eyJ0eXAiOsiJKV1QiLCJhbGciOiJIUI1NiJ9...",
  "expires": 1594904573
}
```

---

## TONIC for Publishers Api V3

### Campaign

#### Get campaign list
**GET** `/privileged/v3/campaign/list`

**Parameters:**
- `state` (optional, default: active) - The state of the campaigns (valid states: incomplete, pending, active, stopped, deleted)
- `output` (optional, default: json) - The output type (json, csv)
- `type` (optional) - Filter for campaigns of a certain type (display, rsoc)

**Response Example:**
```json
[
  {
    "id": "1",
    "name": "First Campaign Test",
    "type": "display",
    "country": "US",
    "imprint": "no",
    "offer_id": "3",
    "offer": "Test Offer",
    "vertical": "Test Vertical",
    "link": "123456.track.com",
    "target": "test-target.bond",
    "direct_link": null
  },
  {
    "id": "2",
    "name": "Second Campaign Test",
    "type": "rsoc",
    "country": "US",
    "imprint": "no",
    "offer_id": "3",
    "offer": "Test Offer",
    "vertical": "Test Vertical",
    "link": "78901.track.com",
    "target": "",
    "direct_link": "https://my-rsoc-site.com/articles/the-article-title?dest=Nzg5MDEudHJhY2suY29t"
  }
]
```

#### Create Campaign
**POST** `/privileged/v3/campaign/create`

**Parameters:**
- `name` (required) - Campaign name
- `offer` (required) - Offer Name
- `offer_id` (optional) - Offer ID (If offerId is provided, offer will be ignored)
- `country` (required) - Country code
- `domain` (optional) - Domain suggestion
- `imprint` (optional) - Default is yes for EU countries and no for non-EU countries (yes/no)
- `return_type` (optional) - Returns the id of the created campaign (id)
- `type` (optional, default: display) - Specifies the type of campaign (display/rsoc)
- `headline_id` (optional) - Specifies the headline/article within the RSOC feed

**Response:**
```json
"Success"
```

#### Set Keywords
**POST** `/privileged/v3/campaign/keywords`

**Request Body:**
```json
{
  "campaign_id": 1,
  "keywords": ["kw1", "kw2", "kw3", "kw4"]
}
```

**Response:**
```json
{
  "KeywordSetId": 24,
  "Keywords": ["kw1", "kw2", "kw3", "kw4"]
}
```

**Control amount of keywords:**
By using the optional parameter `keyword_amount` you are able to control how many keywords will appear on the parking page.

**Note:** keyword_amount must use between 3 and 10 keywords. If no keyword_amount was provided, we automatically fill 6 keywords.

**Example:**
```json
{
  "campaign_id": 1,
  "keywords": ["lorem", "ipsum", "dolor"],
  "keyword_amount": 8
}
```

#### Get Keywords
**GET** `/privileged/v3/campaign/keywords?campaign_id=5`

**Response:**
```json
{
  "KwAmount": 4,
  "Keywords": ["kw1", "kw2", "kw3"]
}
```

#### Get Campaign Status
**GET** `/privileged/v3/campaign/status?name=Lorem ipsum Campaign&id=5`

**Response:**
```json
{
  "0": {
    "link": "78901.track.com",
    "ssl": true
  },
  "status": "active"
}
```

#### Rename Campaign
**PUT** `/privileged/v3/campaign/rename`

**Request Body:**
```json
{
  "campaign_id": 1,
  "campaign_name": "new_name"
}
```

**Response:**
```json
"Campaign #1 was renamed to: test_name"
```

#### Get Callback URLs
**GET** `/privileged/v3/campaign/callback?campaign_id=1`

**Response:**
```json
{
  "responseCode": 200,
  "result": {
    "campaign_id": 2,
    "redirect": "https://example.com",
    "view": "",
    "viewrt": "",
    "click": "",
    "estimated_revenue": "https://example.com",
    "estimated_revenue_5h": "",
    "preestimated_revenue": "https://example.com"
  },
  "status": "success"
}
```

#### Set Callback URL
**POST** `/privileged/v3/campaign/callback`

**Description:**
We will send a GET Request to the URL which has been entered. These URLs are templated. We will replace all parameters in the URL against the matching query parameter.

**Available placeholders:**
- `{campaign_id}`
- `{type}` (redirect, view, viewrt, click, estimated_revenue, estimated_revenue_5h, preestimated_revenue)
- `{timestamp}`
- `{device}` (desktop, tablet, mobile)
- `{keyword}` for viewrt and click
- `{event_id}` unique event id which can be used for deduplication

Every URL parameter of the tracking link could be passed as well. If you send a parameter called foo=bar the templating variable {foo} exists and will be replaced with "bar".

**Parameters:**
- `campaign_id` (required) - Campaign id
- `type` (required) - Type of callback url
- `url` (required) - Your callback url (make sure this is sent as an url-encoded value)

**Response:**
```json
{
  "responseCode": 200,
  "message": "Callback url for view event is successfully saved",
  "status": "success"
}
```

#### Delete Callback URL
**DELETE** `/privileged/v3/campaign/callback`

**Parameters:**
- `campaign_id` (required) - Campaign id
- `type` (required) - Type of callback url

**Response:**
```json
{
  "responseCode": 200,
  "message": "Callback url for view event is successfully deleted",
  "status": "success"
}
```

---

### Pixel

#### Get Pixel
**GET** `/privileged/v3/campaign/pixel?campaign_id=42`

Returns the data of an active pixel for the given campaign id.

**Currently supported types:**
- taboola
- outbrain
- yahoo
- facebook
- tiktok
- google

**Response:**
```json
{
  "source": "taboola",
  "event_name": "add_payment_info",
  "send_revenue": "yes"
}
```

#### Delete Pixel
**DELETE** `/privileged/v3/campaign/pixel?campaign_id=42`

**Response:**
```json
{
  "success": true,
  "message": "Pixel deleted"
}
```

#### Invoke Pixel
**POST** `/privileged/v3/campaign/pixel/invoke`

You can invoke a previously set up pixel in order to test the integration.

**Currently supported types:**
- Facebook
- Twitter
- TikTok

Some networks provide test tokens for instant testing, you may forward them in the request body.

**Response:**
```json
{
  "success": true,
  "message": "Pixel invoked successfully"
}
```

#### Create Taboola Pixel
**POST** `/privileged/v3/campaign/pixel/taboola`

You can create a new taboola pixel or overwrite an existing one. This will overwrite any other Pixel for this campaign.

**Important:** You need to insert `click_id={click_id}` in the Field "tracking code" to activate S2S-Tracking.

**Allowed event names:**
- add_payment_info
- add_to_cart
- add_to_wishlist
- app_install
- complete_registration
- lead
- make_purchase
- search
- start_checkout
- view_content

**Response:**
```json
{
  "success": true,
  "message": "Pixel created"
}
```

#### Create Outbrain Pixel
**POST** `/privileged/v3/campaign/pixel/outbrain`

**Important:** You need to insert `outbrainclickid={{ob_click_id}}` in the campaign tracking box in Outbrain.

**Response:**
```json
{
  "success": true,
  "message": "Pixel created"
}
```

#### Create Yahoo Pixel
**POST** `/privileged/v3/campaign/pixel/yahoo`

**Important:** Make sure to attach `vmcid=${CC}` to your tracking link in yahoo

**Response:**
```json
{
  "success": true,
  "message": "Pixel created"
}
```

#### Create Facebook Pixel
**POST** `/privileged/v3/campaign/pixel/facebook`

**Important:** If you are using the website flow make sure to forward the fbclid parameter to your tonic tracking link exactly as it is passed to your content page.

To transmit conversion data to the Facebook Conversion API, you must include the `access_token` for the datasource.

In order to verify the ownership of the domain, you must include the `domain_verification` parameter.

**Allowed event_name values:**
- AddPaymentInfo
- AddToCart
- AddToWhitelist
- CompleteRegistration
- Contact
- CustomizeProduct
- Donate
- FindLocation
- InitiateCheckout
- Lead
- PageView
- Purchase
- Schedule
- Search
- StartTrial
- SubmitApplication
- Subscribe
- ViewContent

**Allowed revenue_type values:**
- preestimated_revenue (default)
- estimated_revenue
- estimated_revenue_5h

**Response:**
```json
{
  "success": true,
  "message": "Pixel created"
}
```

#### Create TikTok Pixel
**POST** `/privileged/v3/campaign/pixel/tiktok`

**Important:** You need to append `ttclid=__CLICKID__` to the end of your URL in the TikTok Campaign in order to track conversions.

**Allowed revenue_type values:**
- preestimated_revenue (default)
- estimated_revenue
- estimated_revenue_5h

**Response:**
```json
{
  "success": true,
  "message": "Pixel created"
}
```

#### Create Google Pixel
**POST** `/privileged/v3/campaign/pixel/google`

**Allowed revenue_type values:**
- preestimated_revenue (default)
- estimated_revenue
- estimated_revenue_5h

**Response:**
```json
{
  "success": true,
  "message": "Pixel created"
}
```

---

### RSOC (Rich Sponsored Content)

#### Create an Article Request
**POST** `/privileged/v3/rsoc/create`

Creates a new article request. Once approved, the headline_id can be used to create a new RSOC campaign.

**Required Parameters:**
- `offer_id` - The ID of the offer
- `country` - The country code. Use WO for worldwide
- `language` - The intended language of the article
- `domain` - The domain of the RSOC site where the article will be published
- `content_generation_phrases` - Phrases to guide content generation (3-5 phrases)

**Optional Parameters:**
- `headline` - A concise and accurate headline (max 256 characters)
- `teaser` - An engaging opening paragraph (250-1000 characters)
- `citation_links` - 1 URL from a reputable third-party source (feature needs to be enabled)

**Request Body Example:**
```json
{
  "offer_id": 274,
  "country": "WO",
  "language": "en",
  "domain": "my-rsoc-domain.com",
  "content_generation_phrases": [
    "my",
    "generation",
    "phrases"
  ]
}
```

**Response:**
```json
12
```
Returns the id of the requested article.

#### Get Available Domains/Languages
**GET** `/privileged/v3/rsoc/domains`

**Response:**
```json
[
  {
    "domain": "tonic.com",
    "languages": ["de", "en"]
  }
]
```

#### Get Available Headlines/Articles
**GET** `/privileged/v3/rsoc/headlines`

**Response:**
```json
[
  {
    "headline_id": "993",
    "offer_id": "1412",
    "offer_name": "Cell Phone Deals PR",
    "vertical_id": "7",
    "vertical_name": "Communication",
    "country": "US",
    "language": "en",
    "headline": "A Guide to Cell Phone Plans & Deals"
  }
]
```

#### Link External Article
**POST** `/privileged/v3/rsoc/link_external_article`

Creates a new article linked to an external domain.

**Response:**
```json
"Article successfully created with headline_id: 10"
```

#### Get Article Request Details
**GET** `/privileged/v3/rsoc/request?request_id=1234`

**Response:**
```json
{
  "request_id": "1",
  "headline_id": "1234",
  "request_status": "published",
  "rejection_reason": null,
  "country": "DE",
  "offer": "Canvas Prints",
  "language": "de",
  "content_generation_phrases": ["used", "generation", "phrases"]
}
```

#### Get List of All Article Requests
**GET** `/privileged/v3/rsoc/requests`

**Response:**
```json
[
  {
    "request_id": "1",
    "headline_id": "1234",
    "request_status": "published"
  },
  {
    "request_id": "2",
    "headline_id": null,
    "request_status": "rejected"
  }
]
```

#### Get Stats by Country
**GET** `/privileged/v3/rsoc/stats_by_country?date=2023-09-30`

Get the stats for all RSOC campaigns aggregated by traffic country. Available from 2024-09-20 onwards.

**Parameters:**
- `date` (required) - Date (YYYY-MM-DD)
- `hour` (optional) - The hour (0-23). Timezone is PST/PDT (UTC-8/UTC-7)

**Important Note:**
RPC (Revenue Per Click) values are only calculated and returned starting from the 10th click. As long as no click data is reported (fewer than 10 clicks), the API will return 0 for the rpc field and for clicks.

**Response:**
```json
[
  {
    "campaign_id": "123",
    "country_code": "us",
    "clicks": "1",
    "revenue": "0.20",
    "rpc": "0.20"
  }
]
```

---

### Imprint

#### Set Imprint
**PUT** `/privileged/v3/imprint/set?name=Lorem ipsum Campaign&imprint=yes`

Set imprint for a campaign. Returns true if successful, otherwise false.

**Parameters:**
- `name` (required) - Campaign name
- `imprint` (required) - yes/no

**Response:**
```json
true
```

---

### Countries

#### Get Country List
**GET** `/privileged/v3/countries/list`

**Parameters:**
- `output` (optional, default: json) - The output type (json/csv)
- `type` (optional, default: display) - Shows available countries for RSOC feed (display/rsoc)

**Response:**
```json
[
  {
    "code": "AT",
    "name": "Austria"
  },
  {
    "code": "US",
    "name": "United States"
  }
]
```

#### Get Country List for an Offer
**GET** `/privileged/v3/countries/combination?offer=Example String`

**Parameters:**
- `offer` (required) - The Offer Name
- `offer_id` (optional) - Offer id
- `output` (optional, default: json) - The output type
- `type` (optional, default: display) - Shows available countries for specific offer for RSOC feed

**Response:**
```json
[
  {
    "code": "DE",
    "name": "Germany"
  }
]
```

---

### Offers

#### Get Offer List
**GET** `/privileged/v3/offers/list`

**Parameters:**
- `output` (optional, default: json) - The output type
- `type` (optional, default: display) - Shows available offers for RSOC feed (display/rsoc)

**Response:**
```json
[
  {
    "name": "Lorem ipsum",
    "id": 1
  }
]
```

#### Get Offer List for a Country
**GET** `/privileged/v3/offers/combination?country=US`

**Parameters:**
- `country` (required) - The country code according to ISO 3166
- `output` (optional, default: json) - The output type
- `type` (optional, default: display) - Shows available offers for RSOC feed

**Response:**
```json
[
  {
    "name": "dolor sit amet",
    "id": 3
  }
]
```

---

### EPC (Earnings Per Click)

#### Daily EPC Tracking
**GET** `/privileged/v3/epc/daily?date=2020-01-10`

Our EPC tracking allows you to gather valuable click data in almost real time. Estimated revenues for single clicks appear after about 2h.

**Note:** EPC data is only available from 2023-01-01

**Parameters:**
- `date` (required) - The date (YYYY-MM-DD)
- `output` (optional, default: json) - The output type
- `show_revenue_type` (optional, default: no) - Append "revenue_type" column
- `revenue_type` (optional) - Filter by revenue type (estimated_revenue, estimated_revenue_5h, final)
- `show_country` (optional, default: no) - Append "country" column
- `type` (optional) - Filter for campaigns (display/rsoc)

**Response:**
```json
[
  {
    "date": "2017-01-01",
    "campaign_id": "140",
    "campaign_name": "test display campaign",
    "clicks": "10",
    "revenueUsd": "10.5500",
    "subid1": "first-subid-1",
    "subid2": "second-subid",
    "subid3": "third-subid",
    "subid4": "fourth-subid",
    "keyword": "example keyword 1",
    "timestamp": "2017-01-01 12:34:56",
    "adtype": "email",
    "advertiser": "PremiumRate",
    "template": null
  }
]
```

#### Final EPC Tracking
**GET** `/privileged/v3/epc/final?from=2020-01-10&to=2020-01-20`

Get final EPC data. You can request up to 31 days per call.

**Note:** EPC data only available from 2023-01-01

**Parameters:**
- `from` (required) - Start date (YYYY-MM-DD)
- `to` (required) - End date (YYYY-MM-DD)
- `hour` (optional) - The hour (0-23), only when requesting a single day
- `campaign_id` (optional) - Filter by campaign
- `output` (optional, default: json) - The output type
- `show_country` (optional, default: no) - Append "country" column
- `type` (optional) - Filter for campaigns (display/rsoc)

#### 5h Estimation Update
**GET** `/privileged/v3/epc/estimation_update_until`

The revenue estimation is updated after approximately five hours. This endpoint gives the exact date and time until which this estimation update is currently applied.

**Response:**
```json
{
  "date": "2023-07-11 21:10:01"
}
```

---

### Global Settings

#### Get Global Callback URLs
**GET** `/privileged/v3/account/settings/callback`

**Response:**
```json
{
  "responseCode": 200,
  "result": {
    "redirect": "https://example.com",
    "view": "",
    "viewrt": "",
    "click": "",
    "estimated_revenue": "https://example.com",
    "estimated_revenue_5h": "",
    "preestimated_revenue": "https://example.com"
  },
  "status": "success"
}
```

#### Set Global Callback URL
**POST** `/privileged/v3/account/settings/callback`

**Note:** Global callbacks are overruled by callbacks defined on campaign level.

**Available placeholders:**
- `{campaign_id}`
- `{campaign_name}`
- `{type}` (redirect, view, viewrt, click, estimated_revenue, estimated_revenue_5h, preestimated_revenue, compliance_ad_id)
- `{timestamp}`
- `{device}` (desktop, tablet, mobile)
- `{keyword}` for viewrt and click
- `{event_id}` unique event id for deduplication

**General Purpose Callbacks:**
These callbacks are not related to tracking events.

**Ad Compliance Callback:**
The callback `compliance_ad_id` is triggered when one of your ads is disapproved or approved again. Available parameters: `{ad_id}`, `{network}`, `{explanation}`, `{status}`, `{last_check}`, `{compliance_status_change_date}`

**Parameters:**
- `type` (required) - Type of callback url
- `url` (required) - Your callback url (url-encoded)

**Response:**
```json
{
  "responseCode": 200,
  "message": "Callback url for view event is successfully saved",
  "status": "success"
}
```

#### Delete Global Callback URL
**DELETE** `/privileged/v3/account/settings/callback`

**Parameters:**
- `type` (required) - Type of callback url

**Response:**
```json
{
  "responseCode": 200,
  "message": "Callback url for view event is successfully deleted",
  "status": "success"
}
```

---

### Reports

#### Tracking Data Report
**GET** `/privileged/v3/reports/tracking?from=2023-01-01&to=2023-01-30`

Gather valuable click data in almost real time. Estimated revenues for single clicks appear after 20 minutes to 1 hour.

**Note:** Tracking data only available from 2023-01-01

**Parameters:**
- `from` (required) - Beginning of date range (YYYY-MM-DD)
- `to` (required) - End of date range (max 31 days after 'from')
- `date` (optional) - Single date (overrides from/to)
- `columns` (optional) - Comma-separated list of columns
- `output` (optional, default: json) - Output type
- `type` (optional) - Filter for campaigns (display/rsoc)

**Available columns:**
date, campaign_id, campaign_name, clicks, revenueUsd, subid1, subid2, subid3, subid4, keyword, network, site, adtitle, timestamp, device, country

**Response:**
```json
[
  {
    "date": "2023-01-01",
    "campaign_id": "140",
    "campaign_name": "test display campaign",
    "clicks": "10",
    "revenueUsd": "10.5500",
    "subid1": "first-subid-1",
    "keyword": "example keyword 1",
    "network": "some-adnetwork",
    "site": "some-website",
    "adtitle": "this+is+my+adtitle",
    "timestamp": "2023-01-01 12:34:56",
    "displaytype": "mobile"
  }
]
```

---

### Session

#### Daily Session Tracking
**GET** `/privileged/v3/session/daily?date=2020-01-10`

Use the session tracking endpoint to see all views and clicks that happen in the click flow. Monitor and optimize the click through rate from view of the keywords page to ad click.

A date spanning to 8 days in the past can be used.

**Parameters:**
- `date` (required) - The date (YYYY-MM-DD)
- `hour` (optional) - The hour (0-23)
- `campaign_id` (optional) - Filter by campaign
- `output` (optional, default: json) - Output type
- `type` (optional) - Filter for campaigns (display/rsoc)

**Response:**
```json
[
  {
    "date": "2017-01-01",
    "time": "15:00:00",
    "session": "testsession",
    "view": "1",
    "term_view": "0",
    "ad_click": "0",
    "subid1": "first-subid",
    "campaign": "1234_test_campaign",
    "country": "US",
    "keyword": "",
    "useragent": "Mozilla/5.0..."
  }
]
```

---

### Last Final Date

#### Last Final Date
**GET** `/privileged/v3/last/final`

Get the last final date for your campaigns.

**Parameters:**
- `output` (optional, default: json) - Output type

**Response:**
```json
{
  "final-date": "2018-06-21 00:00:00"
}
```

---

### Check if Date is Final

#### Check if Date is Final
**GET** `/privileged/v3/final/date?date=2020-01-10`

**Parameters:**
- `date` (required) - The date to check (YYYY-MM-DD)

**Response:**
```json
[
  {
    "final": "yes"
  }
]
```

---

## Error Responses

### JSON Format
- **400**: `["Bad Request [<uid>]"]`
- **401**: `["Forbidden! [<uid>]"]` / `["Token expired! [<uid>]"]` / `["Invalid token! [<uid>]"]` / `["Signatures do not match! [<uid>]"]`
- **403**: `["Forbidden! Wrong credentials! [<uid>]"]`
- **500**: `["Internal server error! [<uid>]"]`

---

## Code Examples

### JavaScript Client

```javascript
const axios = require('axios');

const BASE_URL = 'https://api.publisher.tonic.com';

async function authenticate (consumerKey, consumerSecret) {
  try {
    const res = await axios.post(`${BASE_URL}/jwt/authenticate`, {
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return res.data.token;
  } catch (err) {
    const status = err.response?.status || 'Unknown';
    const message = err.response?.data || err.message;
    console.error(`Authentication failed. Status: ${status}, Message:`, message);
    return null;
  }
}

async function getCampaignList (token) {
  try {
    const res = await axios.get(`${BASE_URL}/privileged/v3/campaign/list`, {
      headers: {
       'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    console.log(res.data);
  } catch (err) {
    console.error("Error fetching campaigns:", err.response?.data || err.message);
  }
}

// Example usage
(async () => {
  const token = await authenticate('<api-username>', '<api-password>');
  if (token) {
    await getCampaignList(token);
  }
})();
```

### Python Client

```python
import requests

BASE_URL = "https://api.publisher.tonic.com"

def authenticate(consumer_key, consumer_secret):
    url = f"{BASE_URL}/jwt/authenticate"
    payload = {
        "consumer_key": consumer_key,
        "consumer_secret": consumer_secret
    }

    response = requests.post(url, json=payload)
    if response.status_code == 200:
        return response.json().get("token")
    else:
        print(f"Authentication failed. Status: {response.status_code}, Message: {response.text}")
        return None

def get_campaign_list(token):
    url = f"{BASE_URL}/privileged/v3/campaign/list"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }

    response = requests.get(url, headers=headers)
    print(response.json())

# Example usage
token = authenticate("<api-username>", "<api-password>")
if token:
    get_campaign_list(token)
```

### PHP Client

```php
<?php

$baseUrl = 'https://api.publisher.tonic.com';

function authenticate($consumerKey, $consumerSecret)
{
    global $baseUrl;
    $url = $baseUrl . '/jwt/authenticate';

    $payload = json_encode([
        'consumer_key' => $consumerKey,
        'consumer_secret' => $consumerSecret,
    ]);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);

    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status === 200) {
        $data = json_decode($response, true);
        return $data['token'];
    } else {
        echo "Authentication failed. Status: $status, Response: $response\n";
        return null;
    }
}

function getCampaignList($token)
{
    global $baseUrl;
    $url = $baseUrl . '/privileged/v3/campaign/list';

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer $token",
        'Content-Type: application/json'
    ]);

    $response = curl_exec($ch);
    curl_close($ch);

    echo $response;
}

// Example usage
$token = authenticate('<api-username>', '<api-password>');
if ($token) {
    getCampaignList($token);
}
?>
```

---

## Key Features Summary

### 🔐 Authentication
- JWT tokens with 90-minute lifetime
- Secure Bearer token authorization

### 📊 Campaign Management
- Create, list, rename, and manage campaigns
- Support for Display and RSOC campaign types
- Keyword management (3-10 keywords)
- Campaign status tracking
- SSL support

### 🔗 Tracking & Callbacks
- Real-time tracking with SubID parameters (1-4)
- S2S (Server-to-Server) callbacks
- Event-based tracking (redirect, view, viewrt, click, estimated_revenue, etc.)
- Template variables for dynamic callback URLs
- Global and campaign-level callbacks

### 📱 Pixel Integration
- Multiple ad network support:
  - Taboola
  - Outbrain
  - Yahoo
  - Facebook (with Conversion API)
  - TikTok
  - Google
- Revenue tracking options (preestimated, estimated, final)

### 📝 RSOC (Rich Sponsored Content)
- Article generation with AI
- Multi-language support
- Domain and headline management
- External article linking
- Stats by country with RPC (Revenue Per Click)

### 💰 Revenue Tracking
- EPC (Earnings Per Click) tracking
- Real-time revenue estimation
- Final revenue data after ~48 hours
- Multiple revenue types (preestimated, 5h estimated, final)

### 📈 Reporting
- Tracking data reports with granular details
- Session tracking for CTR optimization
- Customizable columns
- Date range queries (up to 31 days)
- Export options (JSON/CSV)

### 🌍 Geo & Offers
- Country and offer combinations
- EU imprint management
- Worldwide support (WO code)

### ⚡ Real-time Features
- Click data in ~2 hours
- Estimation updates after 5 hours
- Final data after ~48 hours
- Session tracking (up to 8 days back)
