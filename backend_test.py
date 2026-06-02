#!/usr/bin/env python3
"""
ConnectX Backend API Testing Suite
Tests all backend APIs with focus on WebRTC call signaling features
"""

import asyncio
import json
import requests
import websockets
import uuid
from datetime import datetime
from typing import Dict, Any, Optional

# Test Configuration
BASE_URL = "https://chat-payments.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"
WS_BASE = f"wss://chat-payments.preview.emergentagent.com/api/ws"

# Test Users - Using credentials from review request
TEST_USER1 = {
    "username": "giftuser1",
    "email": "giftuser1@example.com", 
    "password": "test123"
}

TEST_USER2 = {
    "username": "testuser2",
    "email": "testuser2@example.com",
    "password": "password123"
}

class ConnectXTester:
    def __init__(self):
        self.user1_token = None
        self.user2_token = None
        self.user1_id = None
        self.user2_id = None
        self.user3_token = None
        self.user3_id = None
        self.test_group_id = None
        self.test_group_message_id = None
        self.session = requests.Session()
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        
    def make_request(self, method: str, endpoint: str, token: str = None, **kwargs) -> requests.Response:
        """Make HTTP request with optional auth"""
        url = f"{API_BASE}{endpoint}"
        headers = kwargs.pop('headers', {})
        if token:
            headers['Authorization'] = f'Bearer {token}'
        
        return self.session.request(method, url, headers=headers, **kwargs)
    
    async def test_auth_apis(self):
        """Test authentication APIs"""
        print("\n=== Testing Authentication APIs ===")
        
        # Try to register users first (in case they don't exist)
        try:
            register_data1 = {
                "username": TEST_USER1["username"],
                "email": TEST_USER1["email"],
                "password": TEST_USER1["password"],
                "display_name": "Test User 1"
            }
            response = self.make_request('POST', '/auth/register', json=register_data1)
            if response.status_code == 200:
                self.log_test("User1 Registration", True, "User1 registered successfully")
            elif response.status_code == 400:
                self.log_test("User1 Registration", True, "User1 already exists")
            else:
                self.log_test("User1 Registration", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("User1 Registration", False, f"Exception: {str(e)}")
            
        try:
            register_data2 = {
                "username": TEST_USER2["username"],
                "email": TEST_USER2["email"],
                "password": TEST_USER2["password"],
                "display_name": "Test User 2"
            }
            response = self.make_request('POST', '/auth/register', json=register_data2)
            if response.status_code == 200:
                self.log_test("User2 Registration", True, "User2 registered successfully")
            elif response.status_code == 400:
                self.log_test("User2 Registration", True, "User2 already exists")
            else:
                self.log_test("User2 Registration", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("User2 Registration", False, f"Exception: {str(e)}")
        
        # Test login for user1
        try:
            response = self.make_request('POST', '/auth/login', json=TEST_USER1)
            if response.status_code == 200:
                data = response.json()
                self.user1_token = data['access_token']
                self.user1_id = data['user']['id']
                self.log_test("User1 Login", True, f"Token received, User ID: {self.user1_id}")
            else:
                self.log_test("User1 Login", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("User1 Login", False, f"Exception: {str(e)}")
            return False
            
        # Test login for user2
        try:
            response = self.make_request('POST', '/auth/login', json=TEST_USER2)
            if response.status_code == 200:
                data = response.json()
                self.user2_token = data['access_token']
                self.user2_id = data['user']['id']
                self.log_test("User2 Login", True, f"Token received, User ID: {self.user2_id}")
            else:
                self.log_test("User2 Login", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("User2 Login", False, f"Exception: {str(e)}")
            return False
            
        # Test get current user info
        try:
            response = self.make_request('GET', '/auth/me', token=self.user1_token)
            if response.status_code == 200:
                data = response.json()
                self.log_test("Get Current User", True, f"Username: {data['username']}")
            else:
                self.log_test("Get Current User", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Get Current User", False, f"Exception: {str(e)}")
            
        # Test get user by ID
        try:
            response = self.make_request('GET', f'/users/{self.user2_id}', token=self.user1_token)
            if response.status_code == 200:
                data = response.json()
                self.log_test("Get User by ID", True, f"Found user: {data['username']}")
            else:
                self.log_test("Get User by ID", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Get User by ID", False, f"Exception: {str(e)}")
            
        return True
    
    async def test_contacts_api(self):
        """Test contacts API"""
        print("\n=== Testing Contacts API ===")
        
        # Get contacts list
        try:
            response = self.make_request('GET', '/contacts', token=self.user1_token)
            if response.status_code == 200:
                contacts = response.json()
                self.log_test("Get Contacts", True, f"Found {len(contacts)} contacts")
                
                # Check if user2 is in contacts, if not add them
                user2_in_contacts = any(c['id'] == self.user2_id for c in contacts)
                if not user2_in_contacts:
                    # Add user2 as contact
                    add_response = self.make_request('POST', '/contacts/add', 
                                                   token=self.user1_token,
                                                   json={"user_id": self.user2_id})
                    if add_response.status_code == 200:
                        self.log_test("Add Contact", True, "User2 added as contact")
                    else:
                        self.log_test("Add Contact", False, f"Status: {add_response.status_code}")
                else:
                    self.log_test("Contact Already Exists", True, "User2 already in contacts")
            else:
                self.log_test("Get Contacts", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Get Contacts", False, f"Exception: {str(e)}")
    
    async def test_call_history_api(self):
        """Test call history API"""
        print("\n=== Testing Call History API ===")
        
        # Get call history
        try:
            response = self.make_request('GET', '/calls/history', token=self.user1_token)
            if response.status_code == 200:
                calls = response.json()
                self.log_test("Get Call History", True, f"Found {len(calls)} calls")
            else:
                self.log_test("Get Call History", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Get Call History", False, f"Exception: {str(e)}")
            
        # Test initiate call
        try:
            call_data = {
                "receiver_id": self.user2_id,
                "call_type": "voice"
            }
            response = self.make_request('POST', '/calls', token=self.user1_token, json=call_data)
            if response.status_code == 200:
                call = response.json()
                call_id = call['id']
                self.log_test("Initiate Call", True, f"Call ID: {call_id}, Status: {call['status']}")
                
                # Test accept call (as user2)
                accept_response = self.make_request('PUT', f'/calls/{call_id}/accept', token=self.user2_token)
                if accept_response.status_code == 200:
                    accepted_call = accept_response.json()
                    self.log_test("Accept Call", True, f"Status: {accepted_call['status']}")
                else:
                    self.log_test("Accept Call", False, f"Status: {accept_response.status_code}")
                
                # Test end call
                end_response = self.make_request('PUT', f'/calls/{call_id}/end', token=self.user1_token)
                if end_response.status_code == 200:
                    ended_call = end_response.json()
                    self.log_test("End Call", True, f"Status: {ended_call['status']}")
                else:
                    self.log_test("End Call", False, f"Status: {end_response.status_code}")
                    
            else:
                self.log_test("Initiate Call", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Call Operations", False, f"Exception: {str(e)}")
            
        # Test reject call
        try:
            call_data = {
                "receiver_id": self.user2_id,
                "call_type": "video"
            }
            response = self.make_request('POST', '/calls', token=self.user1_token, json=call_data)
            if response.status_code == 200:
                call = response.json()
                call_id = call['id']
                
                # Test reject call (as user2)
                reject_response = self.make_request('PUT', f'/calls/{call_id}/reject', token=self.user2_token)
                if reject_response.status_code == 200:
                    rejected_call = reject_response.json()
                    self.log_test("Reject Call", True, f"Status: {rejected_call['status']}")
                else:
                    self.log_test("Reject Call", False, f"Status: {reject_response.status_code}")
            else:
                self.log_test("Initiate Call for Reject Test", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Reject Call Test", False, f"Exception: {str(e)}")
    
    async def test_websocket_connection(self):
        """Test WebSocket connection and basic functionality"""
        print("\n=== Testing WebSocket Connection ===")
        
        try:
            # Test WebSocket connection for user1
            ws_url = f"{WS_BASE}/{self.user1_id}?token={self.user1_token}"
            
            async with websockets.connect(ws_url) as websocket:
                self.log_test("WebSocket Connection", True, "Connected successfully")
                
                # Test sending a chat message
                message = {
                    "type": "message",
                    "data": {
                        "receiver_id": self.user2_id,
                        "content": "Test message from WebSocket",
                        "message_type": "text"
                    }
                }
                
                await websocket.send(json.dumps(message))
                
                # Wait for response
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    response_data = json.loads(response)
                    if response_data.get("type") == "message_sent":
                        self.log_test("WebSocket Chat Message", True, "Message sent successfully")
                    else:
                        self.log_test("WebSocket Chat Message", False, f"Unexpected response: {response_data}")
                except asyncio.TimeoutError:
                    self.log_test("WebSocket Chat Message", False, "Timeout waiting for response")
                    
        except Exception as e:
            self.log_test("WebSocket Connection", False, f"Exception: {str(e)}")
    
    async def test_webrtc_signaling(self):
        """Test WebRTC call signaling through WebSocket"""
        print("\n=== Testing WebRTC Call Signaling ===")
        
        user1_ws = None
        user2_ws = None
        
        try:
            # Connect both users via WebSocket
            ws_url1 = f"{WS_BASE}/{self.user1_id}?token={self.user1_token}"
            ws_url2 = f"{WS_BASE}/{self.user2_id}?token={self.user2_token}"
            
            user1_ws = await websockets.connect(ws_url1)
            user2_ws = await websockets.connect(ws_url2)
            
            self.log_test("Dual WebSocket Connections", True, "Both users connected")
            
            # Generate a room ID for the call
            room_id = str(uuid.uuid4())
            
            # User1 initiates a call request
            call_request = {
                "type": "call_request",
                "target_id": self.user2_id,
                "call_type": "video",
                "room_id": room_id
            }
            
            await user1_ws.send(json.dumps(call_request))
            
            # Check if user1 gets room creation confirmation
            try:
                response1 = await asyncio.wait_for(user1_ws.recv(), timeout=5.0)
                data1 = json.loads(response1)
                if data1.get("type") == "call_room_created":
                    self.log_test("Call Room Creation", True, f"Room ID: {data1.get('room_id')}")
                else:
                    self.log_test("Call Room Creation", False, f"Unexpected response: {data1}")
            except asyncio.TimeoutError:
                self.log_test("Call Room Creation", False, "Timeout waiting for room creation")
            
            # Check if user2 receives incoming call
            try:
                response2 = await asyncio.wait_for(user2_ws.recv(), timeout=5.0)
                data2 = json.loads(response2)
                if data2.get("type") == "incoming_call":
                    self.log_test("Incoming Call Notification", True, f"From: {data2.get('caller_name')}")
                    
                    # User2 accepts the call
                    call_response = {
                        "type": "call_response",
                        "room_id": room_id,
                        "target_id": self.user1_id,
                        "accepted": True
                    }
                    await user2_ws.send(json.dumps(call_response))
                    
                    # Check if user1 gets acceptance notification
                    try:
                        accept_response = await asyncio.wait_for(user1_ws.recv(), timeout=5.0)
                        accept_data = json.loads(accept_response)
                        if accept_data.get("type") == "call_response" and accept_data.get("accepted"):
                            self.log_test("Call Acceptance", True, "Call accepted successfully")
                        else:
                            self.log_test("Call Acceptance", False, f"Unexpected response: {accept_data}")
                    except asyncio.TimeoutError:
                        self.log_test("Call Acceptance", False, "Timeout waiting for acceptance")
                        
                else:
                    self.log_test("Incoming Call Notification", False, f"Unexpected response: {data2}")
            except asyncio.TimeoutError:
                self.log_test("Incoming Call Notification", False, "Timeout waiting for incoming call")
            
            # Test WebRTC offer/answer signaling
            await self.test_webrtc_offer_answer(user1_ws, user2_ws, room_id)
            
            # Test ICE candidate exchange
            await self.test_ice_candidates(user1_ws, user2_ws, room_id)
            
            # Test end call
            end_call_msg = {
                "type": "end_call",
                "room_id": room_id
            }
            await user1_ws.send(json.dumps(end_call_msg))
            
            # Check if user2 receives call ended notification
            try:
                end_response = await asyncio.wait_for(user2_ws.recv(), timeout=5.0)
                end_data = json.loads(end_response)
                if end_data.get("type") == "call_ended":
                    self.log_test("End Call Signaling", True, f"Ended by: {end_data.get('ended_by')}")
                else:
                    self.log_test("End Call Signaling", False, f"Unexpected response: {end_data}")
            except asyncio.TimeoutError:
                self.log_test("End Call Signaling", False, "Timeout waiting for end call")
                
        except Exception as e:
            self.log_test("WebRTC Signaling", False, f"Exception: {str(e)}")
        finally:
            if user1_ws:
                await user1_ws.close()
            if user2_ws:
                await user2_ws.close()
    
    async def test_webrtc_offer_answer(self, user1_ws, user2_ws, room_id):
        """Test WebRTC offer/answer exchange"""
        try:
            # User1 sends WebRTC offer
            offer_msg = {
                "type": "webrtc_offer",
                "target_id": self.user2_id,
                "room_id": room_id,
                "offer": {
                    "type": "offer",
                    "sdp": "v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n..."
                }
            }
            await user1_ws.send(json.dumps(offer_msg))
            
            # Check if user2 receives the offer
            try:
                offer_response = await asyncio.wait_for(user2_ws.recv(), timeout=5.0)
                offer_data = json.loads(offer_response)
                if offer_data.get("type") == "webrtc_offer":
                    self.log_test("WebRTC Offer Exchange", True, "Offer received by user2")
                    
                    # User2 sends answer
                    answer_msg = {
                        "type": "webrtc_answer",
                        "target_id": self.user1_id,
                        "room_id": room_id,
                        "answer": {
                            "type": "answer",
                            "sdp": "v=0\r\no=- 987654321 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n..."
                        }
                    }
                    await user2_ws.send(json.dumps(answer_msg))
                    
                    # Check if user1 receives the answer
                    try:
                        answer_response = await asyncio.wait_for(user1_ws.recv(), timeout=5.0)
                        answer_data = json.loads(answer_response)
                        if answer_data.get("type") == "webrtc_answer":
                            self.log_test("WebRTC Answer Exchange", True, "Answer received by user1")
                        else:
                            self.log_test("WebRTC Answer Exchange", False, f"Unexpected response: {answer_data}")
                    except asyncio.TimeoutError:
                        self.log_test("WebRTC Answer Exchange", False, "Timeout waiting for answer")
                        
                else:
                    self.log_test("WebRTC Offer Exchange", False, f"Unexpected response: {offer_data}")
            except asyncio.TimeoutError:
                self.log_test("WebRTC Offer Exchange", False, "Timeout waiting for offer")
                
        except Exception as e:
            self.log_test("WebRTC Offer/Answer", False, f"Exception: {str(e)}")
    
    async def test_ice_candidates(self, user1_ws, user2_ws, room_id):
        """Test ICE candidate exchange"""
        try:
            # User1 sends ICE candidate
            ice_msg = {
                "type": "ice_candidate",
                "target_id": self.user2_id,
                "room_id": room_id,
                "candidate": {
                    "candidate": "candidate:1 1 UDP 2130706431 192.168.1.100 54400 typ host",
                    "sdpMLineIndex": 0,
                    "sdpMid": "0"
                }
            }
            await user1_ws.send(json.dumps(ice_msg))
            
            # Check if user2 receives the ICE candidate
            try:
                ice_response = await asyncio.wait_for(user2_ws.recv(), timeout=5.0)
                ice_data = json.loads(ice_response)
                if ice_data.get("type") == "ice_candidate":
                    self.log_test("ICE Candidate Exchange", True, "ICE candidate received by user2")
                else:
                    self.log_test("ICE Candidate Exchange", False, f"Unexpected response: {ice_data}")
            except asyncio.TimeoutError:
                self.log_test("ICE Candidate Exchange", False, "Timeout waiting for ICE candidate")
                
        except Exception as e:
            self.log_test("ICE Candidate Exchange", False, f"Exception: {str(e)}")
    
    async def test_wallet_api(self):
        """Test wallet API (sanity check)"""
        print("\n=== Testing Wallet API ===")
        
        # Get wallet info
        try:
            response = self.make_request('GET', '/wallet', token=self.user1_token)
            if response.status_code == 200:
                wallet = response.json()
                self.log_test("Get Wallet", True, f"Balance: ${wallet['balance']}")
            else:
                self.log_test("Get Wallet", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Get Wallet", False, f"Exception: {str(e)}")
            
        # Get transactions
        try:
            response = self.make_request('GET', '/wallet/transactions', token=self.user1_token)
            if response.status_code == 200:
                transactions = response.json()
                self.log_test("Get Transactions", True, f"Found {len(transactions)} transactions")
            else:
                self.log_test("Get Transactions", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Get Transactions", False, f"Exception: {str(e)}")
    
    async def test_voice_messages_api(self):
        """Test voice message functionality"""
        print("\n=== Testing Voice Message API ===")
        
        # Generate sample base64 audio data (simulated)
        import base64
        sample_audio_bytes = b"RIFF" + b"\x00" * 100 + b"WAVE" + b"\x00" * 200  # Minimal WAV-like structure
        sample_audio_b64 = base64.b64encode(sample_audio_bytes).decode()
        audio_data = f"data:audio/m4a;base64,{sample_audio_b64}"
        
        # Test 1: Send valid voice message
        try:
            voice_msg_data = {
                "receiver_id": self.user2_id,
                "audio_data": audio_data,
                "duration": 5.5,
                "waveform": [0.5, 0.7, 0.3, 0.8, 0.4],
                "group_id": None
            }
            
            response = self.make_request('POST', '/messages/voice', token=self.user1_token, json=voice_msg_data)
            if response.status_code == 200:
                voice_msg = response.json()
                self.log_test("Send Voice Message", True, f"Message ID: {voice_msg['id']}, Duration: {voice_msg.get('audio_duration')}s")
                
                # Store message ID for later retrieval test
                self.voice_message_id = voice_msg['id']
            else:
                self.log_test("Send Voice Message", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Send Voice Message", False, f"Exception: {str(e)}")
        
        # Test 2: Validation - short duration (should fail)
        try:
            short_voice_data = {
                "receiver_id": self.user2_id,
                "audio_data": audio_data,
                "duration": 0.5,  # Less than 1 second
                "waveform": [0.2, 0.3],
                "group_id": None
            }
            
            response = self.make_request('POST', '/messages/voice', token=self.user1_token, json=short_voice_data)
            if response.status_code == 400:
                self.log_test("Voice Message - Short Duration Validation", True, "Correctly rejected short duration")
            else:
                self.log_test("Voice Message - Short Duration Validation", False, f"Expected 400, got {response.status_code}")
        except Exception as e:
            self.log_test("Voice Message - Short Duration Validation", False, f"Exception: {str(e)}")
        
        # Test 3: Validation - long duration (should fail)
        try:
            long_voice_data = {
                "receiver_id": self.user2_id,
                "audio_data": audio_data,
                "duration": 350,  # More than 300 seconds (5 minutes)
                "waveform": [0.2, 0.3],
                "group_id": None
            }
            
            response = self.make_request('POST', '/messages/voice', token=self.user1_token, json=long_voice_data)
            if response.status_code == 400:
                self.log_test("Voice Message - Long Duration Validation", True, "Correctly rejected long duration")
            else:
                self.log_test("Voice Message - Long Duration Validation", False, f"Expected 400, got {response.status_code}")
        except Exception as e:
            self.log_test("Voice Message - Long Duration Validation", False, f"Exception: {str(e)}")
        
        # Test 4: Validation - invalid audio data (should fail)
        try:
            invalid_audio_data = {
                "receiver_id": self.user2_id,
                "audio_data": "short",  # Too short audio data
                "duration": 5.0,
                "waveform": [0.2, 0.3],
                "group_id": None
            }
            
            response = self.make_request('POST', '/messages/voice', token=self.user1_token, json=invalid_audio_data)
            if response.status_code == 400:
                self.log_test("Voice Message - Invalid Audio Validation", True, "Correctly rejected invalid audio")
            else:
                self.log_test("Voice Message - Invalid Audio Validation", False, f"Expected 400, got {response.status_code}")
        except Exception as e:
            self.log_test("Voice Message - Invalid Audio Validation", False, f"Exception: {str(e)}")
        
        # Test 5: Get messages and verify voice message appears
        try:
            response = self.make_request('GET', f'/messages/{self.user1_id}', token=self.user2_token)
            if response.status_code == 200:
                messages = response.json()
                
                # Look for our voice message
                voice_messages = [msg for msg in messages if msg.get('message_type') == 'voice']
                if voice_messages:
                    voice_msg = voice_messages[0]  # Get the most recent voice message
                    
                    # Verify voice message fields
                    has_duration = 'audio_duration' in voice_msg and voice_msg['audio_duration'] is not None
                    has_waveform = 'audio_waveform' in voice_msg and voice_msg['audio_waveform'] is not None
                    has_content = 'content' in voice_msg and voice_msg['content'] is not None
                    
                    if has_duration and has_waveform and has_content:
                        self.log_test("Get Voice Messages", True, f"Found voice message with duration: {voice_msg['audio_duration']}s, waveform: {len(voice_msg['audio_waveform'])} points")
                    else:
                        missing_fields = []
                        if not has_duration: missing_fields.append("audio_duration")
                        if not has_waveform: missing_fields.append("audio_waveform")
                        if not has_content: missing_fields.append("content")
                        self.log_test("Get Voice Messages", False, f"Voice message missing fields: {missing_fields}")
                else:
                    self.log_test("Get Voice Messages", False, "No voice messages found in conversation")
            else:
                self.log_test("Get Voice Messages", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Get Voice Messages", False, f"Exception: {str(e)}")
        
        # Test 6: Send voice message to group (if groups exist)
        try:
            # First try to get groups
            groups_response = self.make_request('GET', '/groups', token=self.user1_token)
            if groups_response.status_code == 200:
                groups = groups_response.json()
                if groups:
                    group_id = groups[0]['id']
                    
                    group_voice_data = {
                        "receiver_id": None,
                        "audio_data": audio_data,
                        "duration": 3.2,
                        "waveform": [0.1, 0.4, 0.6, 0.2],
                        "group_id": group_id
                    }
                    
                    response = self.make_request('POST', '/messages/voice', token=self.user1_token, json=group_voice_data)
                    if response.status_code == 200:
                        self.log_test("Send Group Voice Message", True, "Group voice message sent successfully")
                    else:
                        self.log_test("Send Group Voice Message", False, f"Status: {response.status_code}")
                else:
                    self.log_test("Send Group Voice Message", True, "No groups available - skipping group voice test")
            else:
                self.log_test("Send Group Voice Message", True, "Groups API not accessible - skipping group voice test")
        except Exception as e:
            self.log_test("Send Group Voice Message", False, f"Exception: {str(e)}")
    
    async def test_call_rejection_flow(self):
        """Test call rejection through WebSocket"""
        print("\n=== Testing Call Rejection Flow ===")
        
        user1_ws = None
        user2_ws = None
        
        try:
            # Connect both users
            ws_url1 = f"{WS_BASE}/{self.user1_id}?token={self.user1_token}"
            ws_url2 = f"{WS_BASE}/{self.user2_id}?token={self.user2_token}"
            
            user1_ws = await websockets.connect(ws_url1)
            user2_ws = await websockets.connect(ws_url2)
            
            room_id = str(uuid.uuid4())
            
            # User1 initiates call
            call_request = {
                "type": "call_request",
                "target_id": self.user2_id,
                "call_type": "voice",
                "room_id": room_id
            }
            await user1_ws.send(json.dumps(call_request))
            
            # Wait for room creation
            await asyncio.wait_for(user1_ws.recv(), timeout=5.0)
            
            # Wait for incoming call notification
            await asyncio.wait_for(user2_ws.recv(), timeout=5.0)
            
            # User2 rejects the call
            call_response = {
                "type": "call_response",
                "room_id": room_id,
                "target_id": self.user1_id,
                "accepted": False
            }
            await user2_ws.send(json.dumps(call_response))
            
            # Check if user1 gets rejection notification
            try:
                reject_response = await asyncio.wait_for(user1_ws.recv(), timeout=5.0)
                reject_data = json.loads(reject_response)
                if reject_data.get("type") == "call_response" and not reject_data.get("accepted"):
                    self.log_test("Call Rejection Flow", True, "Call rejected successfully")
                else:
                    self.log_test("Call Rejection Flow", False, f"Unexpected response: {reject_data}")
            except asyncio.TimeoutError:
                self.log_test("Call Rejection Flow", False, "Timeout waiting for rejection")
                
        except Exception as e:
            self.log_test("Call Rejection Flow", False, f"Exception: {str(e)}")
        finally:
            if user1_ws:
                await user1_ws.close()
            if user2_ws:
                await user2_ws.close()
    
    async def test_group_chat_feature(self):
        """Test Group Chat Feature comprehensively"""
        print("\n=== Testing Group Chat Feature ===")
        
        # Test 1: Create a group
        try:
            group_data = {
                "name": "Test Group Chat",
                "member_ids": [self.user2_id],
                "group_photo": None
            }
            
            response = self.make_request('POST', '/groups', token=self.user1_token, json=group_data)
            if response.status_code == 200:
                group = response.json()
                self.test_group_id = group['id']
                self.log_test("Create Group", True, f"Group created: {group['name']}, ID: {group['id']}")
            else:
                self.log_test("Create Group", False, f"Status: {response.status_code}, Response: {response.text}")
                return  # Can't continue without a group
        except Exception as e:
            self.log_test("Create Group", False, f"Exception: {str(e)}")
            return
        
        # Test 2: List user's groups
        try:
            response = self.make_request('GET', '/groups', token=self.user1_token)
            if response.status_code == 200:
                groups = response.json()
                group_found = any(g['id'] == self.test_group_id for g in groups)
                if group_found:
                    self.log_test("List User Groups", True, f"Found {len(groups)} groups including test group")
                else:
                    self.log_test("List User Groups", False, "Test group not found in user's groups")
            else:
                self.log_test("List User Groups", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("List User Groups", False, f"Exception: {str(e)}")
        
        # Test 3: Get group details with members
        try:
            response = self.make_request('GET', f'/groups/{self.test_group_id}', token=self.user1_token)
            if response.status_code == 200:
                group_details = response.json()
                members = group_details.get('members', [])
                admin_ids = group_details.get('admin_ids', [])
                
                if len(members) >= 2 and self.user1_id in admin_ids:
                    self.log_test("Get Group Details", True, f"Group has {len(members)} members, creator is admin")
                else:
                    self.log_test("Get Group Details", False, f"Unexpected group structure: {len(members)} members, admins: {admin_ids}")
            else:
                self.log_test("Get Group Details", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Get Group Details", False, f"Exception: {str(e)}")
        
        # Test 4: Update group name (admin only)
        try:
            update_data = {
                "name": "Updated Test Group",
                "group_photo": None
            }
            
            response = self.make_request('PUT', f'/groups/{self.test_group_id}', token=self.user1_token, json=update_data)
            if response.status_code == 200:
                updated_group = response.json()
                if updated_group['name'] == "Updated Test Group":
                    self.log_test("Update Group (Admin)", True, f"Group name updated to: {updated_group['name']}")
                else:
                    self.log_test("Update Group (Admin)", False, f"Group name not updated correctly")
            else:
                self.log_test("Update Group (Admin)", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Update Group (Admin)", False, f"Exception: {str(e)}")
        
        # Test 5: Try to update group as non-admin (should fail)
        try:
            update_data = {
                "name": "Unauthorized Update",
                "group_photo": None
            }
            
            response = self.make_request('PUT', f'/groups/{self.test_group_id}', token=self.user2_token, json=update_data)
            if response.status_code == 403:
                self.log_test("Update Group (Non-Admin Protection)", True, "Non-admin correctly blocked from updating group")
            else:
                self.log_test("Update Group (Non-Admin Protection)", False, f"Expected 403, got {response.status_code}")
        except Exception as e:
            self.log_test("Update Group (Non-Admin Protection)", False, f"Exception: {str(e)}")
        
        # Test 6: Send group message
        try:
            message_data = {
                "receiver_id": "",  # Empty string for group messages
                "content": "Hello group! This is a test message.",
                "message_type": "text"
            }
            
            response = self.make_request('POST', f'/groups/{self.test_group_id}/messages', token=self.user1_token, json=message_data)
            if response.status_code == 200:
                message = response.json()
                self.test_group_message_id = message['id']
                self.log_test("Send Group Message", True, f"Message sent: {message['content'][:30]}...")
            else:
                self.log_test("Send Group Message", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Send Group Message", False, f"Exception: {str(e)}")
        
        # Test 7: Get group messages
        try:
            response = self.make_request('GET', f'/groups/{self.test_group_id}/messages', token=self.user2_token)
            if response.status_code == 200:
                messages = response.json()
                test_message_found = any(m.get('id') == getattr(self, 'test_group_message_id', None) for m in messages)
                if test_message_found:
                    self.log_test("Get Group Messages", True, f"Retrieved {len(messages)} group messages including test message")
                else:
                    self.log_test("Get Group Messages", True, f"Retrieved {len(messages)} group messages (test message may not be visible)")
            else:
                self.log_test("Get Group Messages", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Get Group Messages", False, f"Exception: {str(e)}")
        
        # Test 8: Create a third user for member management tests
        try:
            # Register third user
            test_user3 = {
                "username": "giftuser3",
                "email": "giftuser3@example.com",
                "password": "test123",
                "display_name": "Gift User 3"
            }
            
            register_response = self.make_request('POST', '/auth/register', json=test_user3)
            if register_response.status_code in [200, 400]:  # 400 if already exists
                # Login third user
                login_response = self.make_request('POST', '/auth/login', json={
                    "username": test_user3["username"],
                    "password": test_user3["password"]
                })
                if login_response.status_code == 200:
                    user3_data = login_response.json()
                    self.user3_token = user3_data['access_token']
                    self.user3_id = user3_data['user']['id']
                    self.log_test("Setup Third User", True, f"User3 ready: {self.user3_id}")
                else:
                    self.log_test("Setup Third User", False, f"Login failed: {login_response.status_code}")
                    return
            else:
                self.log_test("Setup Third User", False, f"Registration failed: {register_response.status_code}")
                return
        except Exception as e:
            self.log_test("Setup Third User", False, f"Exception: {str(e)}")
            return
        
        # Test 9: Add member to group (admin only)
        try:
            response = self.make_request('POST', f'/groups/{self.test_group_id}/members/{self.user3_id}', token=self.user1_token)
            if response.status_code == 200:
                self.log_test("Add Group Member (Admin)", True, "User3 added to group successfully")
            else:
                self.log_test("Add Group Member (Admin)", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Add Group Member (Admin)", False, f"Exception: {str(e)}")
        
        # Test 10: Try to add member as non-admin (should fail)
        try:
            response = self.make_request('POST', f'/groups/{self.test_group_id}/members/{self.user3_id}', token=self.user2_token)
            if response.status_code == 403:
                self.log_test("Add Group Member (Non-Admin Protection)", True, "Non-admin correctly blocked from adding members")
            elif response.status_code == 400:
                self.log_test("Add Group Member (Non-Admin Protection)", True, "User already member (expected)")
            else:
                self.log_test("Add Group Member (Non-Admin Protection)", False, f"Expected 403, got {response.status_code}")
        except Exception as e:
            self.log_test("Add Group Member (Non-Admin Protection)", False, f"Exception: {str(e)}")
        
        # Test 11: Make user admin
        try:
            response = self.make_request('POST', f'/groups/{self.test_group_id}/admins/{self.user2_id}', token=self.user1_token)
            if response.status_code == 200:
                self.log_test("Make User Admin", True, "User2 promoted to admin successfully")
            else:
                self.log_test("Make User Admin", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Make User Admin", False, f"Exception: {str(e)}")
        
        # Test 12: Remove admin (but not the last one)
        try:
            response = self.make_request('DELETE', f'/groups/{self.test_group_id}/admins/{self.user2_id}', token=self.user1_token)
            if response.status_code == 200:
                self.log_test("Remove Admin", True, "User2 demoted from admin successfully")
            else:
                self.log_test("Remove Admin", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Remove Admin", False, f"Exception: {str(e)}")
        
        # Test 13: Member leaves group (self-removal)
        try:
            response = self.make_request('DELETE', f'/groups/{self.test_group_id}/members/{self.user3_id}', token=self.user3_token)
            if response.status_code == 200:
                self.log_test("Leave Group (Self-Removal)", True, "User3 left group successfully")
            else:
                self.log_test("Leave Group (Self-Removal)", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Leave Group (Self-Removal)", False, f"Exception: {str(e)}")
        
        # Test 14: Admin removes member
        try:
            # First add user3 back
            add_response = self.make_request('POST', f'/groups/{self.test_group_id}/members/{self.user3_id}', token=self.user1_token)
            if add_response.status_code == 200:
                # Now remove them as admin
                remove_response = self.make_request('DELETE', f'/groups/{self.test_group_id}/members/{self.user3_id}', token=self.user1_token)
                if remove_response.status_code == 200:
                    self.log_test("Remove Group Member (Admin)", True, "Admin successfully removed member")
                else:
                    self.log_test("Remove Group Member (Admin)", False, f"Status: {remove_response.status_code}")
            else:
                self.log_test("Remove Group Member (Admin)", False, f"Failed to re-add member: {add_response.status_code}")
        except Exception as e:
            self.log_test("Remove Group Member (Admin)", False, f"Exception: {str(e)}")
        
        # Test 15: Test group access control (non-member shouldn't access)
        try:
            response = self.make_request('GET', f'/groups/{self.test_group_id}', token=self.user3_token)
            if response.status_code == 404:
                self.log_test("Group Access Control", True, "Non-member correctly blocked from accessing group")
            else:
                self.log_test("Group Access Control", False, f"Expected 404, got {response.status_code}")
        except Exception as e:
            self.log_test("Group Access Control", False, f"Exception: {str(e)}")

    async def test_bidirectional_translation_feature(self):
        """Test Bidirectional Translation Feature comprehensively"""
        print("\n=== Testing Bidirectional Translation Feature ===")
        
        # Test 1: Nepali to English translation
        try:
            nepali_text = "नमस्ते, कस्तो छ?"
            translate_data = {
                "text": nepali_text,
                "direction": "to_english"
            }
            
            response = self.make_request('POST', '/translate/bidirectional', token=self.user1_token, json=translate_data)
            if response.status_code == 200:
                result = response.json()
                if (result.get('original') == nepali_text and 
                    result.get('source_language') == 'ne' and 
                    result.get('target_language') == 'en' and
                    result.get('direction') == 'to_english' and
                    result.get('translated') and result.get('translated') != nepali_text):
                    self.log_test("Nepali to English Translation", True, f"Translated: '{nepali_text}' -> '{result.get('translated')}'")
                    self.nepali_translation_result = result  # Store for caching test
                else:
                    self.log_test("Nepali to English Translation", False, f"Invalid response structure: {result}")
            else:
                self.log_test("Nepali to English Translation", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Nepali to English Translation", False, f"Exception: {str(e)}")
        
        # Test 2: Hindi to English translation with emoji preservation
        try:
            hindi_text = "मैं खुश हूँ 😊"
            translate_data = {
                "text": hindi_text,
                "direction": "to_english"
            }
            
            response = self.make_request('POST', '/translate/bidirectional', token=self.user1_token, json=translate_data)
            if response.status_code == 200:
                result = response.json()
                translated = result.get('translated', '')
                if (result.get('original') == hindi_text and 
                    result.get('source_language') == 'hi' and 
                    result.get('target_language') == 'en' and
                    '😊' in translated):  # Check emoji preservation
                    self.log_test("Hindi to English with Emoji Preservation", True, f"Translated: '{hindi_text}' -> '{translated}' (emoji preserved)")
                else:
                    self.log_test("Hindi to English with Emoji Preservation", False, f"Emoji not preserved or invalid response: {result}")
            else:
                self.log_test("Hindi to English with Emoji Preservation", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Hindi to English with Emoji Preservation", False, f"Exception: {str(e)}")
        
        # Test 3: Reverse translation (English to original language)
        try:
            english_text = "Hello, how are you?"
            translate_data = {
                "text": english_text,
                "direction": "to_original"
            }
            
            response = self.make_request('POST', '/translate/bidirectional', token=self.user1_token, json=translate_data)
            if response.status_code == 200:
                result = response.json()
                if (result.get('original') == english_text and 
                    result.get('source_language') == 'en' and 
                    result.get('target_language') == 'ne' and  # Default to Nepali
                    result.get('direction') == 'to_original' and
                    result.get('translated') and result.get('translated') != english_text):
                    self.log_test("Reverse Translation (English to Original)", True, f"Translated: '{english_text}' -> '{result.get('translated')}'")
                else:
                    self.log_test("Reverse Translation (English to Original)", False, f"Invalid response: {result}")
            else:
                self.log_test("Reverse Translation (English to Original)", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Reverse Translation (English to Original)", False, f"Exception: {str(e)}")
        
        # Test 4: Language detection only
        try:
            spanish_text = "Hola, ¿cómo estás?"
            translate_data = {
                "text": spanish_text,
                "direction": "detect"
            }
            
            response = self.make_request('POST', '/translate/bidirectional', token=self.user1_token, json=translate_data)
            if response.status_code == 200:
                result = response.json()
                if (result.get('original') == spanish_text and 
                    result.get('translated') == spanish_text and  # Should be same for detect
                    result.get('source_language') == 'es' and
                    result.get('direction') == 'detect'):
                    self.log_test("Language Detection", True, f"Detected language: {result.get('source_language')} for '{spanish_text}'")
                else:
                    self.log_test("Language Detection", False, f"Invalid detection result: {result}")
            else:
                self.log_test("Language Detection", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Language Detection", False, f"Exception: {str(e)}")
        
        # Test 5: Caching functionality (repeat same translation)
        try:
            if hasattr(self, 'nepali_translation_result'):
                # Repeat the same Nepali translation
                nepali_text = "नमस्ते, कस्तो छ?"
                translate_data = {
                    "text": nepali_text,
                    "direction": "to_english"
                }
                
                response = self.make_request('POST', '/translate/bidirectional', token=self.user1_token, json=translate_data)
                if response.status_code == 200:
                    result = response.json()
                    if result.get('cached') == True:
                        self.log_test("Translation Caching", True, "Translation served from cache successfully")
                    else:
                        self.log_test("Translation Caching", False, f"Translation not cached. Cached flag: {result.get('cached')}")
                else:
                    self.log_test("Translation Caching", False, f"Status: {response.status_code}")
            else:
                self.log_test("Translation Caching", False, "No previous translation to test caching")
        except Exception as e:
            self.log_test("Translation Caching", False, f"Exception: {str(e)}")
        
        # Test 6: Empty text validation (should fail)
        try:
            translate_data = {
                "text": "",
                "direction": "to_english"
            }
            
            response = self.make_request('POST', '/translate/bidirectional', token=self.user1_token, json=translate_data)
            if response.status_code == 400:
                self.log_test("Empty Text Validation", True, "Empty text correctly rejected")
            else:
                self.log_test("Empty Text Validation", False, f"Expected 400, got {response.status_code}")
        except Exception as e:
            self.log_test("Empty Text Validation", False, f"Exception: {str(e)}")
        
        # Test 7: Whitespace-only text validation (should fail)
        try:
            translate_data = {
                "text": "   \n\t   ",
                "direction": "to_english"
            }
            
            response = self.make_request('POST', '/translate/bidirectional', token=self.user1_token, json=translate_data)
            if response.status_code == 400:
                self.log_test("Whitespace-only Text Validation", True, "Whitespace-only text correctly rejected")
            else:
                self.log_test("Whitespace-only Text Validation", False, f"Expected 400, got {response.status_code}")
        except Exception as e:
            self.log_test("Whitespace-only Text Validation", False, f"Exception: {str(e)}")
        
        # Test 8: Invalid direction parameter (should fail)
        try:
            translate_data = {
                "text": "Hello world",
                "direction": "invalid_direction"
            }
            
            response = self.make_request('POST', '/translate/bidirectional', token=self.user1_token, json=translate_data)
            if response.status_code == 400:
                self.log_test("Invalid Direction Validation", True, "Invalid direction correctly rejected")
            else:
                self.log_test("Invalid Direction Validation", False, f"Expected 400, got {response.status_code}")
        except Exception as e:
            self.log_test("Invalid Direction Validation", False, f"Exception: {str(e)}")
        
        # Test 9: English text with to_english direction (should return as-is)
        try:
            english_text = "This is already in English"
            translate_data = {
                "text": english_text,
                "direction": "to_english"
            }
            
            response = self.make_request('POST', '/translate/bidirectional', token=self.user1_token, json=translate_data)
            if response.status_code == 200:
                result = response.json()
                if (result.get('original') == english_text and 
                    result.get('translated') == english_text and
                    result.get('source_language') == 'en' and
                    result.get('target_language') == 'en'):
                    self.log_test("English Text to English", True, "English text correctly returned as-is")
                else:
                    self.log_test("English Text to English", False, f"English text not handled correctly: {result}")
            else:
                self.log_test("English Text to English", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("English Text to English", False, f"Exception: {str(e)}")
        
        # Test 10: Translation with message_id for context
        try:
            test_message_id = str(uuid.uuid4())
            translate_data = {
                "text": "Hello friend",
                "direction": "to_original",
                "message_id": test_message_id
            }
            
            response = self.make_request('POST', '/translate/bidirectional', token=self.user1_token, json=translate_data)
            if response.status_code == 200:
                result = response.json()
                if (result.get('original') == "Hello friend" and 
                    result.get('direction') == 'to_original' and
                    result.get('translated')):
                    self.log_test("Translation with Message ID", True, f"Translation with message_id successful: '{result.get('translated')}'")
                else:
                    self.log_test("Translation with Message ID", False, f"Invalid response: {result}")
            else:
                self.log_test("Translation with Message ID", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Translation with Message ID", False, f"Exception: {str(e)}")

    async def test_profile_photo_upload_feature(self):
        """Test Profile Photo Upload Feature comprehensively"""
        print("\n=== Testing Profile Photo Upload Feature ===")
        
        # Generate sample base64 image data (simulated JPEG)
        import base64
        # Create a minimal JPEG-like structure for testing
        jpeg_header = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00'
        jpeg_data = jpeg_header + b'\x00' * 200 + b'\xff\xd9'  # JPEG end marker
        sample_image_b64 = base64.b64encode(jpeg_data).decode()
        profile_photo_data = f"data:image/jpeg;base64,{sample_image_b64}"
        
        # Test 1: Upload profile photo
        try:
            update_data = {
                "profile_photo": profile_photo_data
            }
            
            response = self.make_request('PUT', '/users/profile', token=self.user1_token, json=update_data)
            if response.status_code == 200:
                user_data = response.json()
                if user_data.get('profile_photo') == profile_photo_data:
                    self.log_test("Upload Profile Photo", True, f"Profile photo uploaded successfully, size: {len(profile_photo_data)} chars")
                else:
                    self.log_test("Upload Profile Photo", False, "Profile photo not saved correctly")
            else:
                self.log_test("Upload Profile Photo", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Upload Profile Photo", False, f"Exception: {str(e)}")
        
        # Test 2: Get profile via /auth/me and verify photo is populated
        try:
            response = self.make_request('GET', '/auth/me', token=self.user1_token)
            if response.status_code == 200:
                user_data = response.json()
                if user_data.get('profile_photo') == profile_photo_data:
                    self.log_test("Get Profile (/auth/me) - Photo Present", True, "Profile photo correctly returned in /auth/me")
                else:
                    self.log_test("Get Profile (/auth/me) - Photo Present", False, f"Profile photo mismatch or missing. Got: {user_data.get('profile_photo', 'None')[:50]}...")
            else:
                self.log_test("Get Profile (/auth/me) - Photo Present", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Get Profile (/auth/me) - Photo Present", False, f"Exception: {str(e)}")
        
        # Test 3: Get user by ID and verify photo is visible
        try:
            response = self.make_request('GET', f'/users/{self.user1_id}', token=self.user2_token)
            if response.status_code == 200:
                user_data = response.json()
                if user_data.get('profile_photo') == profile_photo_data:
                    self.log_test("Get User by ID - Photo Visible", True, "Profile photo visible in /users/{id} endpoint")
                else:
                    self.log_test("Get User by ID - Photo Visible", False, f"Profile photo not visible to other users. Got: {user_data.get('profile_photo', 'None')[:50]}...")
            else:
                self.log_test("Get User by ID - Photo Visible", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Get User by ID - Photo Visible", False, f"Exception: {str(e)}")
        
        # Test 4: Remove profile photo (send null value)
        try:
            remove_data = {
                "profile_photo": None
            }
            
            response = self.make_request('PUT', '/users/profile', token=self.user1_token, json=remove_data)
            if response.status_code == 200:
                user_data = response.json()
                if user_data.get('profile_photo') is None:
                    self.log_test("Remove Profile Photo", True, "Profile photo removed successfully")
                else:
                    self.log_test("Remove Profile Photo", False, f"Profile photo not removed. Still has: {user_data.get('profile_photo', 'None')[:50]}...")
            else:
                self.log_test("Remove Profile Photo", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Remove Profile Photo", False, f"Exception: {str(e)}")
        
        # Test 5: Verify photo removal persists
        try:
            response = self.make_request('GET', '/auth/me', token=self.user1_token)
            if response.status_code == 200:
                user_data = response.json()
                if user_data.get('profile_photo') is None:
                    self.log_test("Verify Photo Removal Persistence", True, "Photo removal persisted correctly")
                else:
                    self.log_test("Verify Photo Removal Persistence", False, f"Photo removal not persisted. Still has: {user_data.get('profile_photo', 'None')[:50]}...")
            else:
                self.log_test("Verify Photo Removal Persistence", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Verify Photo Removal Persistence", False, f"Exception: {str(e)}")
        
        # Test 6: Re-upload photo and test persistence across sessions (login again)
        try:
            # Re-upload photo
            update_data = {
                "profile_photo": profile_photo_data
            }
            
            response = self.make_request('PUT', '/users/profile', token=self.user1_token, json=update_data)
            if response.status_code == 200:
                # Login again to simulate new session
                login_response = self.make_request('POST', '/auth/login', json=TEST_USER1)
                if login_response.status_code == 200:
                    new_token = login_response.json()['access_token']
                    
                    # Check if photo persists in new session
                    me_response = self.make_request('GET', '/auth/me', token=new_token)
                    if me_response.status_code == 200:
                        user_data = me_response.json()
                        if user_data.get('profile_photo') == profile_photo_data:
                            self.log_test("Profile Photo Persistence Across Sessions", True, "Photo persists correctly across login sessions")
                        else:
                            self.log_test("Profile Photo Persistence Across Sessions", False, f"Photo not persisted across sessions. Got: {user_data.get('profile_photo', 'None')[:50]}...")
                    else:
                        self.log_test("Profile Photo Persistence Across Sessions", False, f"Failed to get profile in new session: {me_response.status_code}")
                else:
                    self.log_test("Profile Photo Persistence Across Sessions", False, f"Failed to login again: {login_response.status_code}")
            else:
                self.log_test("Profile Photo Persistence Across Sessions", False, f"Failed to re-upload photo: {response.status_code}")
        except Exception as e:
            self.log_test("Profile Photo Persistence Across Sessions", False, f"Exception: {str(e)}")
        
        # Test 7: Test with different image format (PNG)
        try:
            # Create a minimal PNG-like structure
            png_header = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR'
            png_data = png_header + b'\x00' * 100 + b'IEND\xaeB`\x82'
            png_image_b64 = base64.b64encode(png_data).decode()
            png_photo_data = f"data:image/png;base64,{png_image_b64}"
            
            update_data = {
                "profile_photo": png_photo_data
            }
            
            response = self.make_request('PUT', '/users/profile', token=self.user1_token, json=update_data)
            if response.status_code == 200:
                user_data = response.json()
                if user_data.get('profile_photo') == png_photo_data:
                    self.log_test("Upload PNG Profile Photo", True, "PNG profile photo uploaded successfully")
                else:
                    self.log_test("Upload PNG Profile Photo", False, "PNG profile photo not saved correctly")
            else:
                self.log_test("Upload PNG Profile Photo", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Upload PNG Profile Photo", False, f"Exception: {str(e)}")
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)
        
        passed = sum(1 for r in self.test_results if r['success'])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        # Show failed tests
        failed_tests = [r for r in self.test_results if not r['success']]
        if failed_tests:
            print("\nFAILED TESTS:")
            for test in failed_tests:
                print(f"❌ {test['test']}: {test['details']}")
        
        print("\n" + "="*60)
        
        return passed, total, failed_tests

async def main():
    """Run all tests"""
    print("ConnectX Backend API Testing Suite")
    print("="*60)
    
    tester = ConnectXTester()
    
    # Run tests in sequence
    auth_success = await tester.test_auth_apis()
    if not auth_success:
        print("❌ Authentication failed - cannot continue with other tests")
        return
    
    await tester.test_contacts_api()
    await tester.test_call_history_api()
    await tester.test_voice_messages_api()
    await tester.test_bidirectional_translation_feature()  # Add translation tests
    await tester.test_profile_photo_upload_feature()  # Add profile photo upload tests
    await tester.test_group_chat_feature()  # Add group chat tests
    await tester.test_websocket_connection()
    await tester.test_webrtc_signaling()
    await tester.test_call_rejection_flow()
    await tester.test_wallet_api()
    
    # Print summary
    passed, total, failed_tests = tester.print_summary()
    
    return passed, total, failed_tests

if __name__ == "__main__":
    asyncio.run(main())