# ConnectX - WeChat-like Mobile App

## Overview
ConnectX is a comprehensive mobile messaging and communication app similar to WeChat, built with Expo (React Native) for cross-platform mobile support and FastAPI for the backend.

## Core Features

### 1. Authentication
- JWT-based authentication with email/username and password
- User registration and login
- Session persistence using AsyncStorage
- Secure token management

### 2. User Profiles
- Profile photo upload (stored as base64)
- Display name, username, status message
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

### 4. Contacts Management
- Add/remove contacts
- Search users by username/email
- View contact profiles
- Quick actions (chat, call)

### 5. Voice & Video Calls
- Voice calls with mute/speaker controls
- Video calls with camera toggle
- Call history tracking
- WebRTC signaling via backend

### 6. Wallet & Payments (Mock)
- Mock wallet with initial $1000 balance
- Send money to contacts
- Transaction history
- Transaction notes

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
- AsyncStorage for persistence

### Backend
- FastAPI
- MongoDB (Motor async driver)
- JWT authentication (python-jose)
- WebSocket support
- Emergent LLM Key for translations

## API Endpoints

### Authentication
- POST /api/auth/register - User registration
- POST /api/auth/login - User login
- GET /api/auth/me - Get current user

### Users & Contacts
- PUT /api/users/profile - Update profile
- GET /api/users/search - Search users
- GET /api/users/{id} - Get user by ID
- POST /api/contacts/add - Add contact
- DELETE /api/contacts/{id} - Remove contact
- GET /api/contacts - List contacts

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
