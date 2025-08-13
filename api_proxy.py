#!/usr/bin/env python3
"""
API Proxy Service - Python Flask Version
En proxy-tjänst som fungerar som mellanhand mellan Softr-applikationer och externa API:er
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
import re
from datetime import datetime, timedelta
import logging
import json

# Konfigurera loggning
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Konfiguration från miljövariabler
PORT = int(os.getenv('PORT', 3000))
EXTERNAL_API_URL = os.getenv('EXTERNAL_API_URL', 'https://api.example.com/organizations')
EXTERNAL_API_KEY = os.getenv('EXTERNAL_API_KEY', None)
ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', '*')

# Bolagsverket API konfiguration
BOLAGSVERKET_CLIENT_ID = os.getenv('BOLAGSVERKET_CLIENT_ID')
BOLAGSVERKET_CLIENT_SECRET = os.getenv('BOLAGSVERKET_CLIENT_SECRET')
BOLAGSVERKET_ENVIRONMENT = os.getenv('BOLAGSVERKET_ENVIRONMENT', 'test')

# Bolagsverket endpoints
BOLAGSVERKET_ENDPOINTS = {
    'test': {
        'token': 'https://portal-accept2.api.bolagsverket.se/oauth2/token',
        'isalive': 'https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/isalive',
        'organisationer': 'https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer',
        'dokumentlista': 'https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/dokumentlista',
        'dokument': 'https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/dokument'
    },
    'production': {
        'token': 'https://portal.api.bolagsverket.se/oauth2/token',
        'isalive': 'https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/isalive',
        'organisationer': 'https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer',
        'dokumentlista': 'https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/dokumentlista',
        'dokument': 'https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/dokument'
    }
}

# OAuth2 Token Management för Bolagsverket
bolagsverket_token = None
token_expiry = None

def get_bolagsverket_token():
    """Hämta OAuth2 token för Bolagsverket API"""
    global bolagsverket_token, token_expiry
    
    # Kontrollera om vi har en giltig token
    if bolagsverket_token and token_expiry and datetime.now() < token_expiry:
        return bolagsverket_token
    
    try:
        if not BOLAGSVERKET_CLIENT_ID or not BOLAGSVERKET_CLIENT_SECRET:
            raise Exception('Bolagsverket Client ID och Client Secret måste konfigureras')
        
        env = BOLAGSVERKET_ENVIRONMENT
        token_url = BOLAGSVERKET_ENDPOINTS[env]['token']
        
        # Förbered data för Client Credentials flow
        data = {
            'grant_type': 'client_credentials',
            'client_id': BOLAGSVERKET_CLIENT_ID,
            'client_secret': BOLAGSVERKET_CLIENT_SECRET,
            'scope': 'vardefulla-datamangder:read vardefulla-datamangder:ping'
        }
        
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        
        logger.info(f"Requesting OAuth2 token from: {token_url}")
        
        # Gör request för att hämta token
        response = requests.post(
            token_url,
            data=data,
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            logger.error(f"Token request failed: {response.status_code} - {response.text}")
            raise Exception(f"Token request failed: {response.status_code}")
        
        token_data = response.json()
        bolagsverket_token = token_data['access_token']
        
        # Sätt utgångstid baserat på expires_in (standard 1 timme)
        expires_in = token_data.get('expires_in', 3600)
        token_expiry = datetime.now() + timedelta(seconds=expires_in - 600)  # 10 minuter tidigare
        
        logger.info(f"🔑 Ny Bolagsverket OAuth token genererad, utgång: {token_expiry.isoformat()}")
        return bolagsverket_token
        
    except Exception as error:
        logger.error(f'Error getting Bolagsverket token: {error}')
        raise error

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'OK',
        'timestamp': datetime.now().isoformat(),
        'service': 'API Proxy Service (Python)'
    })

@app.route('/api/lookup', methods=['POST'])
def lookup_organization():
    """Huvudendpoint för organisationsnummer lookup"""
    try:
        # Hämta data från request
        data = request.get_json()
        
        if not data:
            return jsonify({
                'error': 'Ogiltig JSON-data',
                'message': 'Invalid JSON data in request body'
            }), 400
        
        org_number = data.get('orgNumber')
        
        # Validera input
        if not org_number:
            return jsonify({
                'error': 'Organisationsnummer är obligatoriskt',
                'message': 'Please provide orgNumber in request body'
            }), 400
        
        # Validera organisationsnummer format (svenskt format)
        org_number_clean = re.sub(r'[-\s]', '', str(org_number))
        if not re.match(r'^\d{10}$|^\d{11}$', org_number_clean):
            return jsonify({
                'error': 'Ogiltigt organisationsnummer format',
                'message': 'Organization number should be 10-11 digits'
            }), 400
        
        # Kontrollera att externt API är konfigurerat
        if not EXTERNAL_API_URL or EXTERNAL_API_URL == 'https://api.example.com/organizations':
            return jsonify({
                'error': 'Externt API inte konfigurerat',
                'message': 'Please set EXTERNAL_API_URL environment variable'
            }), 500
        
        # Förbered request till externt API
        api_url = f"{EXTERNAL_API_URL}/{org_number_clean}"
        headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'API-Proxy-Service-Python/1.0'
        }
        
        # Lägg till API-nyckel om den finns
        if EXTERNAL_API_KEY:
            headers['Authorization'] = f'Bearer {EXTERNAL_API_KEY}'
        
        logger.info(f"Making request to external API for org number: {org_number_clean}")
        
        # Gör request till externt API
        response = requests.get(
            api_url,
            headers=headers,
            timeout=10
        )
        
        # Hantera svaret
        if response.status_code == 200:
            return jsonify({
                'success': True,
                'data': response.json(),
                'timestamp': datetime.now().isoformat(),
                'orgNumber': org_number_clean
            })
        else:
            return jsonify({
                'error': 'Externt API fel',
                'message': f'External API returned status {response.status_code}',
                'status': response.status_code
            }), response.status_code
            
    except requests.exceptions.Timeout:
        return jsonify({
            'error': 'Timeout från externt API',
            'message': 'External API request timed out'
        }), 504
        
    except requests.exceptions.ConnectionError:
        return jsonify({
            'error': 'Externt API otillgängligt',
            'message': 'External API is not responding'
        }), 503
        
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({
            'error': 'Internt serverfel',
            'message': 'Internal server error'
        }), 500

# ========================================
# Bolagsverket API Endpoints
# ========================================

@app.route('/api/bolagsverket/isalive', methods=['GET'])
def bolagsverket_isalive():
    """Testa Bolagsverket API-anslutning"""
    try:
        token = get_bolagsverket_token()
        env = BOLAGSVERKET_ENVIRONMENT
        isalive_url = BOLAGSVERKET_ENDPOINTS[env]['isalive']
        
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
            'User-Agent': 'API-Proxy-Service-Python/1.0'
        }
        
        logger.info("Testing Bolagsverket API connection")
        
        response = requests.get(isalive_url, headers=headers, timeout=10)
        
        logger.info(f"Bolagsverket API response status: {response.status_code}")
        logger.info(f"Bolagsverket API response headers: {dict(response.headers)}")
        logger.info(f"Bolagsverket API response text: {response.text[:500]}...")
        
        if response.status_code == 200:
            try:
                response_data = response.json()
                return jsonify({
                    'success': True,
                    'message': 'Bolagsverket API är tillgängligt',
                    'data': response_data,
                    'timestamp': datetime.now().isoformat(),
                    'source': 'Bolagsverket'
                })
            except json.JSONDecodeError as e:
                logger.warning(f"Bolagsverket API returned non-JSON response: {response.text}")
                return jsonify({
                    'success': True,
                    'message': 'Bolagsverket API är tillgängligt (icke-JSON svar)',
                    'data': {
                        'response_text': response.text,
                        'content_type': response.headers.get('content-type', 'unknown')
                    },
                    'timestamp': datetime.now().isoformat(),
                    'source': 'Bolagsverket'
                })
        else:
            return jsonify({
                'error': 'Bolagsverket API fel',
                'message': f'Bolagsverket API returned status {response.status_code}',
                'status': response.status_code,
                'response_text': response.text
            }), response.status_code
            
    except Exception as error:
        logger.error(f'Error testing Bolagsverket API: {error}')
        return jsonify({
            'error': 'Fel vid test av Bolagsverket API',
            'message': str(error)
        }), 500

@app.route('/api/bolagsverket/organisationer', methods=['POST'])
def bolagsverket_organisationer():
    """Hämta företagsinformation från Bolagsverket"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'error': 'Ogiltig JSON-data',
                'message': 'Invalid JSON data in request body'
            }), 400
        
        org_number = data.get('organisationsnummer')
        
        if not org_number:
            return jsonify({
                'error': 'Organisationsnummer är obligatoriskt',
                'message': 'Please provide organisationsnummer in request body'
            }), 400
        
        # Validera organisationsnummer format (10-12 siffror för att inkludera personnummer)
        org_number_clean = re.sub(r'[-\s]', '', str(org_number))
        if not re.match(r'^\d{10}$|^\d{11}$|^\d{12}$', org_number_clean):
            return jsonify({
                'error': 'Ogiltigt organisationsnummer format',
                'message': 'Organization number should be 10-12 digits'
            }), 400
        
        token = get_bolagsverket_token()
        env = BOLAGSVERKET_ENVIRONMENT
        org_url = BOLAGSVERKET_ENDPOINTS[env]['organisationer']
        
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'API-Proxy-Service-Python/1.0'
        }
        
        # Försök med olika payload-format och content-types
        test_variants = [
            # Bara organisationsnumret som sträng
            {'payload': org_number_clean, 'content_type': 'application/json', 'use_json': True},
            {'payload': str(org_number_clean), 'content_type': 'application/json', 'use_json': True},
            # JSON format med objekt
            {'payload': {'organisationsnummer': org_number_clean}, 'content_type': 'application/json', 'use_json': True},
            {'payload': {'organisationsnummer': str(org_number_clean)}, 'content_type': 'application/json', 'use_json': True},
            {'payload': {'orgNumber': org_number_clean}, 'content_type': 'application/json', 'use_json': True},
            {'payload': {'organizationNumber': org_number_clean}, 'content_type': 'application/json', 'use_json': True},
            # Form data format
            {'payload': {'organisationsnummer': org_number_clean}, 'content_type': 'application/x-www-form-urlencoded', 'use_json': False},
            {'payload': {'organisationsnummer': str(org_number_clean)}, 'content_type': 'application/x-www-form-urlencoded', 'use_json': False},
        ]
        
        success = False
        for i, variant in enumerate(test_variants):
            logger.info(f"Trying variant {i+1}: {variant['payload']} with {variant['content_type']}")
            
            headers['Content-Type'] = variant['content_type']
            
            if variant['use_json']:
                response = requests.post(org_url, headers=headers, json=variant['payload'], timeout=30)
            else:
                response = requests.post(org_url, headers=headers, data=variant['payload'], timeout=30)
            
            if response.status_code == 200:
                logger.info(f"Success with variant {i+1}")
                success = True
                break
            elif response.status_code != 400:
                logger.info(f"Non-400 status with variant {i+1}: {response.status_code}")
                break
            else:
                logger.info(f"400 status with variant {i+1}, trying next...")
        
        if not success:
            # Om alla varianter misslyckas, använd den första
            payload = {'organisationsnummer': org_number_clean}
            headers['Content-Type'] = 'application/json'
            response = requests.post(org_url, headers=headers, json=payload, timeout=30)
        
        logger.info(f"Bolagsverket organisationer response status: {response.status_code}")
        logger.info(f"Bolagsverket organisationer response text: {response.text[:500]}...")
        
        if response.status_code == 200:
            try:
                response_data = response.json()
                return jsonify({
                    'success': True,
                    'data': response_data,
                    'timestamp': datetime.now().isoformat(),
                    'orgNumber': org_number_clean,
                    'source': 'Bolagsverket'
                })
            except json.JSONDecodeError as e:
                logger.warning(f"Bolagsverket organisationer returned non-JSON response: {response.text}")
                return jsonify({
                    'success': True,
                    'message': 'Bolagsverket API svar (icke-JSON)',
                    'data': {
                        'response_text': response.text,
                        'content_type': response.headers.get('content-type', 'unknown')
                    },
                    'timestamp': datetime.now().isoformat(),
                    'orgNumber': org_number_clean,
                    'source': 'Bolagsverket'
                })
        else:
            return jsonify({
                'error': 'Bolagsverket API fel',
                'message': f'Bolagsverket API returned status {response.status_code}',
                'status': response.status_code,
                'response_text': response.text
            }), response.status_code
            
    except Exception as error:
        logger.error(f'Error in Bolagsverket organisationer API: {error}')
        return jsonify({
            'error': 'Fel vid hämtning av företagsinformation',
            'message': str(error),
            'endpoint': '/api/bolagsverket/organisationer'
        }), 500

@app.route('/api/bolagsverket/dokumentlista', methods=['POST'])
def bolagsverket_dokumentlista():
    """Hämta dokumentlista från Bolagsverket"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'error': 'Ogiltig JSON-data',
                'message': 'Invalid JSON data in request body'
            }), 400
        
        org_number = data.get('organisationsnummer')
        
        if not org_number:
            return jsonify({
                'error': 'Organisationsnummer är obligatoriskt',
                'message': 'Please provide organisationsnummer in request body'
            }), 400
        
        # Validera organisationsnummer format (10-12 siffror för att inkludera personnummer)
        org_number_clean = re.sub(r'[-\s]', '', str(org_number))
        if not re.match(r'^\d{10}$|^\d{11}$|^\d{12}$', org_number_clean):
            return jsonify({
                'error': 'Ogiltigt organisationsnummer format',
                'message': 'Organization number should be 10-12 digits'
            }), 400
        
        token = get_bolagsverket_token()
        env = BOLAGSVERKET_ENVIRONMENT
        dokumentlista_url = BOLAGSVERKET_ENDPOINTS[env]['dokumentlista']
        
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'API-Proxy-Service-Python/1.0'
        }
        
        payload = {
            'organisationsnummer': org_number_clean
        }
        
        logger.info(f"Fetching document list from Bolagsverket for: {org_number_clean}")
        
        response = requests.post(dokumentlista_url, headers=headers, data=payload, timeout=30)
        
        if response.status_code == 200:
            return jsonify({
                'success': True,
                'data': response.json(),
                'timestamp': datetime.now().isoformat(),
                'orgNumber': org_number_clean,
                'source': 'Bolagsverket'
            })
        else:
            return jsonify({
                'error': 'Bolagsverket API fel',
                'message': f'Bolagsverket API returned status {response.status_code}',
                'status': response.status_code,
                'response': response.text
            }), response.status_code
            
    except Exception as error:
        logger.error(f'Error in Bolagsverket dokumentlista API: {error}')
        return jsonify({
            'error': 'Fel vid hämtning av dokumentlista',
            'message': str(error),
            'endpoint': '/api/bolagsverket/dokumentlista'
        }), 500

@app.route('/api/bolagsverket/dokument/<dokument_id>', methods=['GET'])
def bolagsverket_dokument(dokument_id):
    """Hämta specifikt dokument från Bolagsverket"""
    try:
        if not dokument_id:
            return jsonify({
                'error': 'Dokument ID är obligatoriskt',
                'message': 'Please provide dokument ID'
            }), 400
        
        token = get_bolagsverket_token()
        env = BOLAGSVERKET_ENVIRONMENT
        dokument_url = f"{BOLAGSVERKET_ENDPOINTS[env]['dokument']}/{dokument_id}"
        
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
            'User-Agent': 'API-Proxy-Service-Python/1.0'
        }
        
        logger.info(f"Fetching document from Bolagsverket: {dokument_id}")
        
        response = requests.get(dokument_url, headers=headers, timeout=30)
        
        if response.status_code == 200:
            return jsonify({
                'success': True,
                'data': response.json(),
                'timestamp': datetime.now().isoformat(),
                'dokumentId': dokument_id,
                'source': 'Bolagsverket'
            })
        else:
            return jsonify({
                'error': 'Bolagsverket API fel',
                'message': f'Bolagsverket API returned status {response.status_code}',
                'status': response.status_code,
                'response': response.text
            }), response.status_code
            
    except Exception as error:
        logger.error(f'Error in Bolagsverket dokument API: {error}')
        return jsonify({
            'error': 'Fel vid hämtning av dokument',
            'message': str(error),
            'endpoint': f'/api/bolagsverket/dokument/{dokument_id}'
        }), 500

@app.errorhandler(404)
def not_found(error):
    """404 error handler"""
    return jsonify({
        'error': 'Endpoint hittades inte',
        'message': 'Requested endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    """500 error handler"""
    return jsonify({
        'error': 'Internt serverfel',
        'message': 'Internal server error'
    }), 500

if __name__ == '__main__':
    print(f"🚀 API Proxy Service (Python) starting on port {PORT}")
    print(f"📊 Health check: http://localhost:{PORT}/health")
    print(f"🔗 API endpoint: http://localhost:{PORT}/api/lookup")
    print(f"🌐 External API: {EXTERNAL_API_URL}")
    
    if not EXTERNAL_API_KEY:
        print("⚠️  Warning: No API key configured")
    
    app.run(host='0.0.0.0', port=PORT, debug=True)
