# ConnectX - WeChat-like Mobile App

## Overview
ConnectX is a comprehensive mobile messaging and communication app similar to WeChat, built with Expo (React Native) for cross-platform mobile support and FastAPI for the backend.

## Core Features

### 1. Authentication
- JWT-based authentication with email/username and password
- Phone number registration (optional)
- User registration and login
- Session persistence using AsyncStorage
- Secure token management

### 2. User Profiles
- Profile photo upload (stored as base64)
- Display name, username, status message
- Phone number (for contact matching)
- Profile editing capabilities
- Online status tracking

### 3. Real-time Chat
- One-to-one messaging via WebSocket
- Support for text messages
- Image sharing from gallery
- Typing indicators
- Read receipts
- Message timestamps
- Translation feature (English, Nepali, Hindi) using Emergent LLM Key

### 4. Phone Contact Matching
- Request permission to access mobile phone contacts
- Match phone numbers with registered users
- Registered contacts show "Available on ConnectX"
- Non-registered contacts show "Invite" button
- SMS invitation support
- Contacts are processed securely on-device
- SectionList UI with "On ConnectX" and "Invite to ConnectX" sections
- Local contact caching for offline support

### 5. Voice & Video Calls
- Voice calls with mute/speaker controls
- Video calls with camera toggle
- Call history tracking
- WebRTC signaling via backend

### 6. Wallet & Payments (MOCK)
- **MOCK wallet system** with $1000 initial balance
- Enhanced wallet UI with balance card
- Send money to contacts
- Quick amount buttons ($10, $25, $50, $100)
- Transaction notes support
- 3-step send flow: Select Contact → Enter Amount → Confirm
- Transaction history with details
- Transaction detail modal
- Request money (UI ready)
- Top Up (UI ready)
- QR Code payments (UI ready)

### 7. UI/UX
- Bottom tab navigation (Chats, Calls, Contacts, Wallet, Profile)
- Light and dark mode support
- WeChat-inspired design
- Mobile-optimized layouts

## Technical Stack

### Frontend
- Expo / React Native
- expo-router for navigation
- Zustand for state management
- socket.io-client for real-time communication
- expo-image-picker for media
- expo-contacts for phone contacts
- expo-sms for invitations
- AsyncStorage for persistence

### Backend
- FastAPI
- MongoDB (Motor async driver)
- JWT authentication (python-jose)
- WebSocket support
- Phone number normalization
- Emergent LLM Key for translations

## API Endpoints

### Authentication
- POST /api/auth/register - User registration (with optional phone)
- POST /api/auth/login - User login
- GET /api/auth/me - Get current user

### Users & Contacts
- PUT /api/users/profile - Update profile
- GET /api/users/search - Search users
- GET /api/users/{id} - Get user by ID
- POST /api/contacts/add - Add contact
- DELETE /api/contacts/{id} - Remove contact
- GET /api/contacts - List contacts
- POST /api/contacts/match-phones - Match phone numbers with registered users
- POST /api/contacts/add-by-phone - Add contact by phone number

### Chat
- POST /api/messages - Send message
- GET /api/messages/{user_id} - Get conversation
- GET /api/conversations - List conversations

### Groups
- POST /api/groups - Create group
- GET /api/groups - List groups
- GET /api/groups/{id}/messages - Get group messages

### Calls
- POST /api/calls - Initiate call
- PUT /api/calls/{id}/accept - Accept call
- PUT /api/calls/{id}/reject - Reject call
- PUT /api/calls/{id}/end - End call
- GET /api/calls/history - Call history

### Wallet
- GET /api/wallet - Get wallet balance
- POST /api/wallet/send - Send money
- GET /api/wallet/transactions - Transaction history

### Translation
- POST /api/translate - Translate text

### WebSocket
- ws://host/ws/{user_id}?token={jwt} - Real-time communication
