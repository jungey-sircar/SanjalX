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
BASE_URL = "https://webrtc-preview.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"
WS_BASE = f"wss://webrtc-preview.preview.emergentagent.com/api/ws"

# Test Users
TEST_USER1 = {
    "username": "testuser1",
    "email": "testuser1@example.com", 
    "password": "password123"
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
    await tester.test_websocket_connection()
    await tester.test_webrtc_signaling()
    await tester.test_call_rejection_flow()
    await tester.test_wallet_api()
    
    # Print summary
    passed, total, failed_tests = tester.print_summary()
    
    return passed, total, failed_tests

if __name__ == "__main__":
    asyncio.run(main())