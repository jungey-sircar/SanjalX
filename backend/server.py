from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import httpx
import json
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'connectx_db')]

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET', 'connectx-secret-key-change-in-production-2024')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security
security = HTTPBearer()

# Emergent LLM Key for translation
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', 'sk-emergent-fCaFeB3Fc7f9e8aD7E')

# Create the main app
app = FastAPI(title="ConnectX API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== MODELS ==============

class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    display_name: Optional[str] = None
    phone_number: Optional[str] = None

class UserLogin(BaseModel):
    username: str  # Can be username or email or phone
    password: str

class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    status_message: Optional[str] = None
    profile_photo: Optional[str] = None  # Base64 encoded
    phone_number: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    display_name: str
    status_message: str
    profile_photo: Optional[str] = None
    phone_number: Optional[str] = None
    created_at: datetime
    is_online: bool = False

class PhoneMatchRequest(BaseModel):
    phone_numbers: List[str]

class PhoneMatchResponse(BaseModel):
    phone_number: str
    is_registered: bool
    user: Optional[UserResponse] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class ContactRequest(BaseModel):
    user_id: str

class MessageCreate(BaseModel):
    receiver_id: str
    content: str
    message_type: str = "text"  # text, image, voice, video
    group_id: Optional[str] = None

class MessageResponse(BaseModel):
    id: str
    sender_id: str
    receiver_id: Optional[str] = None
    group_id: Optional[str] = None
    content: str
    message_type: str
    created_at: datetime
    read: bool = False
    translated_content: Optional[str] = None

class GroupCreate(BaseModel):
    name: str
    member_ids: List[str]
    group_photo: Optional[str] = None

class GroupResponse(BaseModel):
    id: str
    name: str
    creator_id: str
    member_ids: List[str]
    group_photo: Optional[str] = None
    created_at: datetime

class CallCreate(BaseModel):
    receiver_id: str
    call_type: str = "voice"  # voice or video

class CallResponse(BaseModel):
    id: str
    caller_id: str
    receiver_id: str
    call_type: str
    status: str  # pending, accepted, rejected, ended, missed
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_at: datetime

class TransactionCreate(BaseModel):
    receiver_id: str
    amount: float
    note: Optional[str] = None

class TransactionResponse(BaseModel):
    id: str
    sender_id: str
    receiver_id: str
    amount: float
    note: Optional[str] = None
    status: str  # completed, pending, failed
    created_at: datetime

class WalletResponse(BaseModel):
    id: str
    user_id: str
    balance: float
    created_at: datetime

class TranslateRequest(BaseModel):
    text: str
    target_language: str  # en, ne, hi

# ============== HELPER FUNCTIONS ==============

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await db.users.find_one({"id": user_id})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def user_to_response(user: dict) -> UserResponse:
    return UserResponse(
        id=user["id"],
        username=user["username"],
        email=user["email"],
        display_name=user.get("display_name", user["username"]),
        status_message=user.get("status_message", "Hey there! I'm using ConnectX"),
        profile_photo=user.get("profile_photo"),
        phone_number=user.get("phone_number"),
        created_at=user["created_at"],
        is_online=user.get("is_online", False)
    )

def normalize_phone_number(phone: str) -> str:
    """Normalize phone number by removing spaces, dashes, and adding country code if missing"""
    import re
    # Remove all non-digit characters except +
    cleaned = re.sub(r'[^\d+]', '', phone)
    # If doesn't start with +, assume it needs country code
    if not cleaned.startswith('+'):
        # Default to +1 (US) if no country code - can be configured
        if len(cleaned) == 10:
            cleaned = '+1' + cleaned
        elif len(cleaned) > 10:
            cleaned = '+' + cleaned
    return cleaned

# ============== AUTH ROUTES ==============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if username or email exists
    existing = await db.users.find_one({"$or": [
        {"username": user_data.username.lower()},
        {"email": user_data.email.lower()}
    ]})
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")
    
    # Check if phone number exists (if provided)
    phone_normalized = None
    if user_data.phone_number:
        phone_normalized = normalize_phone_number(user_data.phone_number)
        existing_phone = await db.users.find_one({"phone_number": phone_normalized})
        if existing_phone:
            raise HTTPException(status_code=400, detail="Phone number already registered")
    
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "username": user_data.username.lower(),
        "email": user_data.email.lower(),
        "password_hash": get_password_hash(user_data.password),
        "display_name": user_data.display_name or user_data.username,
        "status_message": "Hey there! I'm using ConnectX",
        "profile_photo": None,
        "phone_number": phone_normalized,
        "created_at": datetime.utcnow(),
        "is_online": False,
        "contacts": [],
        "blocked_users": []
    }
    await db.users.insert_one(user)
    
    # Create wallet for user
    wallet = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "balance": 1000.0,  # Initial mock balance
        "created_at": datetime.utcnow()
    }
    await db.wallets.insert_one(wallet)
    
    token = create_access_token({"sub": user_id})
    return TokenResponse(
        access_token=token,
        user=user_to_response(user)
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(login_data: UserLogin):
    user = await db.users.find_one({"$or": [
        {"username": login_data.username.lower()},
        {"email": login_data.username.lower()}
    ]})
    
    if not user or not verify_password(login_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_access_token({"sub": user["id"]})
    return TokenResponse(
        access_token=token,
        user=user_to_response(user)
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return user_to_response(current_user)

# ============== USER ROUTES ==============

@api_router.put("/users/profile", response_model=UserResponse)
async def update_profile(update_data: UserUpdate, current_user: dict = Depends(get_current_user)):
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    if update_dict:
        await db.users.update_one({"id": current_user["id"]}, {"$set": update_dict})
        updated_user = await db.users.find_one({"id": current_user["id"]})
        return user_to_response(updated_user)
    return user_to_response(current_user)

@api_router.get("/users/search", response_model=List[UserResponse])
async def search_users(query: str, current_user: dict = Depends(get_current_user)):
    users = await db.users.find({
        "$and": [
            {"id": {"$ne": current_user["id"]}},
            {"$or": [
                {"username": {"$regex": query, "$options": "i"}},
                {"display_name": {"$regex": query, "$options": "i"}},
                {"email": {"$regex": query, "$options": "i"}}
            ]}
        ]
    }).to_list(50)
    return [user_to_response(u) for u in users]

@api_router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user_to_response(user)

# ============== CONTACTS ROUTES ==============

@api_router.post("/contacts/add")
async def add_contact(request: ContactRequest, current_user: dict = Depends(get_current_user)):
    if request.user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot add yourself as contact")
    
    contact_user = await db.users.find_one({"id": request.user_id})
    if not contact_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    contacts = current_user.get("contacts", [])
    if request.user_id in contacts:
        raise HTTPException(status_code=400, detail="Already in contacts")
    
    contacts.append(request.user_id)
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"contacts": contacts}})
    return {"message": "Contact added successfully"}

@api_router.delete("/contacts/{user_id}")
async def remove_contact(user_id: str, current_user: dict = Depends(get_current_user)):
    contacts = current_user.get("contacts", [])
    if user_id not in contacts:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    contacts.remove(user_id)
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"contacts": contacts}})
    return {"message": "Contact removed successfully"}

@api_router.get("/contacts", response_model=List[UserResponse])
async def get_contacts(current_user: dict = Depends(get_current_user)):
    contact_ids = current_user.get("contacts", [])
    if not contact_ids:
        return []
    
    contacts = await db.users.find({"id": {"$in": contact_ids}}).to_list(1000)
    return [user_to_response(c) for c in contacts]

@api_router.post("/contacts/match-phones", response_model=List[PhoneMatchResponse])
async def match_phone_contacts(request: PhoneMatchRequest, current_user: dict = Depends(get_current_user)):
    """Match phone numbers from device contacts with registered users"""
    results = []
    
    for phone in request.phone_numbers:
        normalized = normalize_phone_number(phone)
        
        # Find user with this phone number (exclude current user)
        user = await db.users.find_one({
            "phone_number": normalized,
            "id": {"$ne": current_user["id"]}
        })
        
        if user:
            results.append(PhoneMatchResponse(
                phone_number=phone,
                is_registered=True,
                user=user_to_response(user)
            ))
        else:
            results.append(PhoneMatchResponse(
                phone_number=phone,
                is_registered=False,
                user=None
            ))
    
    return results

@api_router.post("/contacts/add-by-phone")
async def add_contact_by_phone(phone_number: str, current_user: dict = Depends(get_current_user)):
    """Add a contact by their phone number"""
    normalized = normalize_phone_number(phone_number)
    
    contact_user = await db.users.find_one({"phone_number": normalized})
    if not contact_user:
        raise HTTPException(status_code=404, detail="User with this phone number not found")
    
    if contact_user["id"] == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot add yourself as contact")
    
    contacts = current_user.get("contacts", [])
    if contact_user["id"] in contacts:
        raise HTTPException(status_code=400, detail="Already in contacts")
    
    contacts.append(contact_user["id"])
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"contacts": contacts}})
    return {"message": "Contact added successfully", "user": user_to_response(contact_user)}

# ============== CHAT ROUTES ==============

@api_router.post("/messages", response_model=MessageResponse)
async def send_message(message: MessageCreate, current_user: dict = Depends(get_current_user)):
    msg_id = str(uuid.uuid4())
    msg = {
        "id": msg_id,
        "sender_id": current_user["id"],
        "receiver_id": message.receiver_id if not message.group_id else None,
        "group_id": message.group_id,
        "content": message.content,
        "message_type": message.message_type,
        "created_at": datetime.utcnow(),
        "read": False,
        "translated_content": None
    }
    await db.messages.insert_one(msg)
    
    return MessageResponse(**msg)

@api_router.get("/messages/{user_id}", response_model=List[MessageResponse])
async def get_messages(user_id: str, current_user: dict = Depends(get_current_user), limit: int = 100):
    messages = await db.messages.find({
        "$or": [
            {"sender_id": current_user["id"], "receiver_id": user_id},
            {"sender_id": user_id, "receiver_id": current_user["id"]}
        ]
    }).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Mark as read
    await db.messages.update_many(
        {"sender_id": user_id, "receiver_id": current_user["id"], "read": False},
        {"$set": {"read": True}}
    )
    
    return [MessageResponse(**m) for m in reversed(messages)]

@api_router.get("/conversations", response_model=List[dict])
async def get_conversations(current_user: dict = Depends(get_current_user)):
    # Get all unique users we have conversations with
    pipeline = [
        {"$match": {"$or": [
            {"sender_id": current_user["id"]},
            {"receiver_id": current_user["id"]}
        ]}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": {
                "$cond": [
                    {"$eq": ["$sender_id", current_user["id"]]},
                    "$receiver_id",
                    "$sender_id"
                ]
            },
            "last_message": {"$first": "$$ROOT"},
            "unread_count": {
                "$sum": {
                    "$cond": [
                        {"$and": [
                            {"$eq": ["$receiver_id", current_user["id"]]},
                            {"$eq": ["$read", False]}
                        ]},
                        1,
                        0
                    ]
                }
            }
        }}
    ]
    
    conversations = await db.messages.aggregate(pipeline).to_list(100)
    
    result = []
    for conv in conversations:
        if conv["_id"]:
            user = await db.users.find_one({"id": conv["_id"]})
            if user:
                result.append({
                    "user": user_to_response(user).dict(),
                    "last_message": MessageResponse(**conv["last_message"]).dict(),
                    "unread_count": conv["unread_count"]
                })
    
    return result

# ============== GROUP ROUTES ==============

@api_router.post("/groups", response_model=GroupResponse)
async def create_group(group_data: GroupCreate, current_user: dict = Depends(get_current_user)):
    group_id = str(uuid.uuid4())
    member_ids = list(set([current_user["id"]] + group_data.member_ids))
    
    group = {
        "id": group_id,
        "name": group_data.name,
        "creator_id": current_user["id"],
        "member_ids": member_ids,
        "group_photo": group_data.group_photo,
        "created_at": datetime.utcnow()
    }
    await db.groups.insert_one(group)
    return GroupResponse(**group)

@api_router.get("/groups", response_model=List[GroupResponse])
async def get_groups(current_user: dict = Depends(get_current_user)):
    groups = await db.groups.find({"member_ids": current_user["id"]}).to_list(100)
    return [GroupResponse(**g) for g in groups]

@api_router.get("/groups/{group_id}/messages", response_model=List[MessageResponse])
async def get_group_messages(group_id: str, current_user: dict = Depends(get_current_user), limit: int = 100):
    group = await db.groups.find_one({"id": group_id})
    if not group or current_user["id"] not in group["member_ids"]:
        raise HTTPException(status_code=404, detail="Group not found")
    
    messages = await db.messages.find({"group_id": group_id}).sort("created_at", -1).limit(limit).to_list(limit)
    return [MessageResponse(**m) for m in reversed(messages)]

# ============== CALL ROUTES ==============

@api_router.post("/calls", response_model=CallResponse)
async def initiate_call(call_data: CallCreate, current_user: dict = Depends(get_current_user)):
    call_id = str(uuid.uuid4())
    call = {
        "id": call_id,
        "caller_id": current_user["id"],
        "receiver_id": call_data.receiver_id,
        "call_type": call_data.call_type,
        "status": "pending",
        "started_at": None,
        "ended_at": None,
        "created_at": datetime.utcnow()
    }
    await db.calls.insert_one(call)
    return CallResponse(**call)

@api_router.put("/calls/{call_id}/accept", response_model=CallResponse)
async def accept_call(call_id: str, current_user: dict = Depends(get_current_user)):
    call = await db.calls.find_one({"id": call_id, "receiver_id": current_user["id"]})
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    await db.calls.update_one(
        {"id": call_id},
        {"$set": {"status": "accepted", "started_at": datetime.utcnow()}}
    )
    updated_call = await db.calls.find_one({"id": call_id})
    return CallResponse(**updated_call)

@api_router.put("/calls/{call_id}/reject", response_model=CallResponse)
async def reject_call(call_id: str, current_user: dict = Depends(get_current_user)):
    call = await db.calls.find_one({"id": call_id, "receiver_id": current_user["id"]})
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    await db.calls.update_one({"id": call_id}, {"$set": {"status": "rejected"}})
    updated_call = await db.calls.find_one({"id": call_id})
    return CallResponse(**updated_call)

@api_router.put("/calls/{call_id}/end", response_model=CallResponse)
async def end_call(call_id: str, current_user: dict = Depends(get_current_user)):
    call = await db.calls.find_one({
        "id": call_id,
        "$or": [{"caller_id": current_user["id"]}, {"receiver_id": current_user["id"]}]
    })
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    await db.calls.update_one(
        {"id": call_id},
        {"$set": {"status": "ended", "ended_at": datetime.utcnow()}}
    )
    updated_call = await db.calls.find_one({"id": call_id})
    return CallResponse(**updated_call)

@api_router.get("/calls/history", response_model=List[CallResponse])
async def get_call_history(current_user: dict = Depends(get_current_user)):
    calls = await db.calls.find({
        "$or": [{"caller_id": current_user["id"]}, {"receiver_id": current_user["id"]}]
    }).sort("created_at", -1).to_list(100)
    return [CallResponse(**c) for c in calls]

# ============== WALLET ROUTES ==============

@api_router.get("/wallet", response_model=WalletResponse)
async def get_wallet(current_user: dict = Depends(get_current_user)):
    wallet = await db.wallets.find_one({"user_id": current_user["id"]})
    if not wallet:
        # Create wallet if not exists
        wallet = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "balance": 1000.0,
            "created_at": datetime.utcnow()
        }
        await db.wallets.insert_one(wallet)
    return WalletResponse(**wallet)

@api_router.post("/wallet/send", response_model=TransactionResponse)
async def send_money(transaction: TransactionCreate, current_user: dict = Depends(get_current_user)):
    if transaction.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    sender_wallet = await db.wallets.find_one({"user_id": current_user["id"]})
    if not sender_wallet or sender_wallet["balance"] < transaction.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    
    receiver = await db.users.find_one({"id": transaction.receiver_id})
    if not receiver:
        raise HTTPException(status_code=404, detail="Receiver not found")
    
    receiver_wallet = await db.wallets.find_one({"user_id": transaction.receiver_id})
    if not receiver_wallet:
        receiver_wallet = {
            "id": str(uuid.uuid4()),
            "user_id": transaction.receiver_id,
            "balance": 0.0,
            "created_at": datetime.utcnow()
        }
        await db.wallets.insert_one(receiver_wallet)
    
    # Update balances
    await db.wallets.update_one(
        {"user_id": current_user["id"]},
        {"$inc": {"balance": -transaction.amount}}
    )
    await db.wallets.update_one(
        {"user_id": transaction.receiver_id},
        {"$inc": {"balance": transaction.amount}}
    )
    
    # Create transaction record
    tx_id = str(uuid.uuid4())
    tx = {
        "id": tx_id,
        "sender_id": current_user["id"],
        "receiver_id": transaction.receiver_id,
        "amount": transaction.amount,
        "note": transaction.note,
        "status": "completed",
        "created_at": datetime.utcnow()
    }
    await db.transactions.insert_one(tx)
    
    return TransactionResponse(**tx)

@api_router.get("/wallet/transactions", response_model=List[TransactionResponse])
async def get_transactions(current_user: dict = Depends(get_current_user)):
    transactions = await db.transactions.find({
        "$or": [{"sender_id": current_user["id"]}, {"receiver_id": current_user["id"]}]
    }).sort("created_at", -1).to_list(100)
    return [TransactionResponse(**t) for t in transactions]

# ============== TRANSLATION ROUTE ==============

@api_router.post("/translate")
async def translate_text(request: TranslateRequest, current_user: dict = Depends(get_current_user)):
    language_names = {
        "en": "English",
        "ne": "Nepali",
        "hi": "Hindi"
    }
    
    target_lang_name = language_names.get(request.target_language, "English")
    
    try:
        async with httpx.AsyncClient() as client:
            # Use the Emergent API endpoint for LLM calls
            response = await client.post(
                "https://api.emergentmethods.ai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {EMERGENT_LLM_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {
                            "role": "system",
                            "content": f"You are a translator. Translate the following text to {target_lang_name}. Only respond with the translation, nothing else."
                        },
                        {
                            "role": "user",
                            "content": request.text
                        }
                    ],
                    "max_tokens": 500
                },
                timeout=30.0
            )
            
            if response.status_code == 200:
                data = response.json()
                translated = data["choices"][0]["message"]["content"].strip()
                return {"original": request.text, "translated": translated, "target_language": request.target_language}
            else:
                logger.error(f"Translation API error: {response.text}")
                # Fallback: Return original text with note
                return {"original": request.text, "translated": f"[Translation unavailable] {request.text}", "target_language": request.target_language}
    except Exception as e:
        logger.error(f"Translation error: {str(e)}")
        # Fallback: Return original text with note
        return {"original": request.text, "translated": f"[Translation unavailable] {request.text}", "target_language": request.target_language}

# ============== PUSH NOTIFICATION ROUTES ==============

@api_router.post("/notifications/token")
async def register_push_token(token: dict, current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"push_token": token.get("token")}}
    )
    return {"message": "Push token registered"}

# ============== WEBSOCKET FOR REAL-TIME ==============

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.call_rooms: Dict[str, Dict] = {}  # room_id -> {participants: [], call_type: str, creator_id: str}
    
    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        await db.users.update_one({"id": user_id}, {"$set": {"is_online": True}})
    
    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        # Remove user from any call rooms
        for room_id, room in list(self.call_rooms.items()):
            if user_id in room["participants"]:
                room["participants"].remove(user_id)
                if len(room["participants"]) == 0:
                    del self.call_rooms[room_id]
        # Schedule the DB update as a background task
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(self._update_user_offline(user_id))
        except RuntimeError:
            pass

    async def _update_user_offline(self, user_id: str):
        try:
            await db.users.update_one({"id": user_id}, {"$set": {"is_online": False}})
        except Exception as e:
            print(f"Error updating user offline status: {e}")
    
    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
            except:
                self.disconnect(user_id)
    
    async def broadcast_to_users(self, message: dict, user_ids: List[str]):
        for user_id in user_ids:
            await self.send_personal_message(message, user_id)
    
    def create_call_room(self, room_id: str, creator_id: str, call_type: str, participant_ids: List[str] = None):
        """Create a new call room"""
        self.call_rooms[room_id] = {
            "participants": [creator_id] + (participant_ids or []),
            "call_type": call_type,
            "creator_id": creator_id,
            "created_at": datetime.utcnow().isoformat()
        }
        return self.call_rooms[room_id]
    
    def join_call_room(self, room_id: str, user_id: str) -> Optional[Dict]:
        """Join an existing call room"""
        if room_id in self.call_rooms:
            if user_id not in self.call_rooms[room_id]["participants"]:
                self.call_rooms[room_id]["participants"].append(user_id)
            return self.call_rooms[room_id]
        return None
    
    def leave_call_room(self, room_id: str, user_id: str) -> Optional[Dict]:
        """Leave a call room"""
        if room_id in self.call_rooms:
            if user_id in self.call_rooms[room_id]["participants"]:
                self.call_rooms[room_id]["participants"].remove(user_id)
            # Delete room if empty
            if len(self.call_rooms[room_id]["participants"]) == 0:
                del self.call_rooms[room_id]
                return None
            return self.call_rooms[room_id]
        return None
    
    def get_call_room(self, room_id: str) -> Optional[Dict]:
        """Get call room info"""
        return self.call_rooms.get(room_id)
    
    def get_room_participants(self, room_id: str) -> List[str]:
        """Get list of participants in a room"""
        if room_id in self.call_rooms:
            return self.call_rooms[room_id]["participants"]
        return []

manager = ConnectionManager()

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, token: str = None):
    await _handle_websocket(websocket, user_id, token)

@app.websocket("/api/ws/{user_id}")
async def websocket_endpoint_api(websocket: WebSocket, user_id: str, token: str = None):
    await _handle_websocket(websocket, user_id, token)

async def _handle_websocket(websocket: WebSocket, user_id: str, token: str = None):
    # Verify token
    try:
        if token:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            if payload.get("sub") != user_id:
                await websocket.close(code=4001)
                return
        else:
            await websocket.close(code=4001)
            return
    except JWTError:
        await websocket.close(code=4001)
        return
    
    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            
            if msg_type == "message":
                # Handle chat message
                msg_data = data.get("data", {})
                msg_id = str(uuid.uuid4())
                msg = {
                    "id": msg_id,
                    "sender_id": user_id,
                    "receiver_id": msg_data.get("receiver_id"),
                    "group_id": msg_data.get("group_id"),
                    "content": msg_data.get("content"),
                    "message_type": msg_data.get("message_type", "text"),
                    "created_at": datetime.utcnow(),
                    "read": False
                }
                await db.messages.insert_one(msg)
                
                # Send to receiver
                msg["created_at"] = msg["created_at"].isoformat()
                if msg_data.get("group_id"):
                    group = await db.groups.find_one({"id": msg_data.get("group_id")})
                    if group:
                        await manager.broadcast_to_users(
                            {"type": "new_message", "data": msg},
                            [m for m in group["member_ids"] if m != user_id]
                        )
                else:
                    await manager.send_personal_message(
                        {"type": "new_message", "data": msg},
                        msg_data.get("receiver_id")
                    )
                
                # Confirm to sender
                await manager.send_personal_message(
                    {"type": "message_sent", "data": msg},
                    user_id
                )
            
            elif msg_type == "typing":
                # Handle typing indicator
                receiver_id = data.get("receiver_id")
                if receiver_id:
                    await manager.send_personal_message(
                        {"type": "typing", "user_id": user_id},
                        receiver_id
                    )
            
            # ============== WebRTC Signaling ==============
            
            elif msg_type == "call_request":
                # 1:1 call request - create a room and notify target
                target_id = data.get("target_id")
                call_type = data.get("call_type", "voice")
                room_id = data.get("room_id") or str(uuid.uuid4())
                
                if target_id:
                    # Create call room
                    manager.create_call_room(room_id, user_id, call_type, [])
                    
                    # Save call record to DB
                    call_record = {
                        "id": room_id,
                        "caller_id": user_id,
                        "receiver_id": target_id,
                        "call_type": call_type,
                        "status": "pending",
                        "started_at": None,
                        "ended_at": None,
                        "created_at": datetime.utcnow()
                    }
                    await db.calls.insert_one(call_record)
                    
                    caller = await db.users.find_one({"id": user_id})
                    await manager.send_personal_message(
                        {
                            "type": "incoming_call",
                            "room_id": room_id,
                            "from_id": user_id,
                            "caller_name": caller.get("display_name", caller.get("username")),
                            "caller_photo": caller.get("profile_photo"),
                            "call_type": call_type,
                            "is_group_call": False
                        },
                        target_id
                    )
                    
                    # Confirm room creation to caller
                    await manager.send_personal_message(
                        {
                            "type": "call_room_created",
                            "room_id": room_id,
                            "call_type": call_type
                        },
                        user_id
                    )
            
            elif msg_type == "group_call_request":
                # Group call request - create room and notify all participants
                participant_ids = data.get("participant_ids", [])
                call_type = data.get("call_type", "video")
                room_id = data.get("room_id") or str(uuid.uuid4())
                group_name = data.get("group_name", "Group Call")
                
                if participant_ids:
                    # Create call room with all participants
                    manager.create_call_room(room_id, user_id, call_type, [])
                    
                    caller = await db.users.find_one({"id": user_id})
                    
                    # Notify all participants
                    for participant_id in participant_ids:
                        if participant_id != user_id:
                            await manager.send_personal_message(
                                {
                                    "type": "incoming_call",
                                    "room_id": room_id,
                                    "from_id": user_id,
                                    "caller_name": caller.get("display_name", caller.get("username")),
                                    "caller_photo": caller.get("profile_photo"),
                                    "call_type": call_type,
                                    "is_group_call": True,
                                    "group_name": group_name,
                                    "participant_ids": participant_ids
                                },
                                participant_id
                            )
                    
                    # Confirm to caller
                    await manager.send_personal_message(
                        {
                            "type": "call_room_created",
                            "room_id": room_id,
                            "call_type": call_type,
                            "is_group_call": True,
                            "participant_ids": participant_ids
                        },
                        user_id
                    )
            
            elif msg_type == "join_call":
                # User wants to join a call room
                room_id = data.get("room_id")
                if room_id:
                    room = manager.join_call_room(room_id, user_id)
                    if room:
                        # Get user info
                        joiner = await db.users.find_one({"id": user_id})
                        
                        # Notify existing participants that someone joined
                        other_participants = [p for p in room["participants"] if p != user_id]
                        for participant_id in other_participants:
                            await manager.send_personal_message(
                                {
                                    "type": "participant_joined",
                                    "room_id": room_id,
                                    "user_id": user_id,
                                    "user_name": joiner.get("display_name", joiner.get("username")),
                                    "user_photo": joiner.get("profile_photo"),
                                    "participants": room["participants"]
                                },
                                participant_id
                            )
                        
                        # Send room info to joiner (including existing participants)
                        participants_info = []
                        for p_id in other_participants:
                            p_user = await db.users.find_one({"id": p_id})
                            if p_user:
                                participants_info.append({
                                    "id": p_id,
                                    "name": p_user.get("display_name", p_user.get("username")),
                                    "photo": p_user.get("profile_photo")
                                })
                        
                        await manager.send_personal_message(
                            {
                                "type": "joined_call",
                                "room_id": room_id,
                                "call_type": room["call_type"],
                                "participants": participants_info
                            },
                            user_id
                        )
            
            elif msg_type == "leave_call":
                # User leaves a call
                room_id = data.get("room_id")
                if room_id:
                    room = manager.leave_call_room(room_id, user_id)
                    
                    # Notify remaining participants
                    if room:
                        for participant_id in room["participants"]:
                            await manager.send_personal_message(
                                {
                                    "type": "participant_left",
                                    "room_id": room_id,
                                    "user_id": user_id,
                                    "participants": room["participants"]
                                },
                                participant_id
                            )
                    
                    # Confirm to leaver
                    await manager.send_personal_message(
                        {"type": "left_call", "room_id": room_id},
                        user_id
                    )
            
            elif msg_type == "call_response":
                # Accept/reject call
                room_id = data.get("room_id")
                target_id = data.get("target_id")
                accepted = data.get("accepted", False)
                
                if room_id and target_id:
                    if accepted:
                        # Join the room
                        manager.join_call_room(room_id, user_id)
                        # Update call record
                        await db.calls.update_one(
                            {"id": room_id},
                            {"$set": {"status": "accepted", "started_at": datetime.utcnow()}}
                        )
                    else:
                        # Update call record as rejected
                        await db.calls.update_one(
                            {"id": room_id},
                            {"$set": {"status": "rejected"}}
                        )
                    
                    await manager.send_personal_message(
                        {
                            "type": "call_response",
                            "room_id": room_id,
                            "from_id": user_id,
                            "accepted": accepted
                        },
                        target_id
                    )
            
            elif msg_type == "webrtc_offer":
                # WebRTC offer - relay to target peer
                target_id = data.get("target_id")
                room_id = data.get("room_id")
                offer = data.get("offer")
                
                if target_id and offer:
                    await manager.send_personal_message(
                        {
                            "type": "webrtc_offer",
                            "room_id": room_id,
                            "from_id": user_id,
                            "offer": offer
                        },
                        target_id
                    )
            
            elif msg_type == "webrtc_answer":
                # WebRTC answer - relay to target peer
                target_id = data.get("target_id")
                room_id = data.get("room_id")
                answer = data.get("answer")
                
                if target_id and answer:
                    await manager.send_personal_message(
                        {
                            "type": "webrtc_answer",
                            "room_id": room_id,
                            "from_id": user_id,
                            "answer": answer
                        },
                        target_id
                    )
            
            elif msg_type == "ice_candidate":
                # ICE candidate - relay to target peer
                target_id = data.get("target_id")
                room_id = data.get("room_id")
                candidate = data.get("candidate")
                
                if target_id and candidate:
                    await manager.send_personal_message(
                        {
                            "type": "ice_candidate",
                            "room_id": room_id,
                            "from_id": user_id,
                            "candidate": candidate
                        },
                        target_id
                    )
            
            elif msg_type == "end_call":
                # End call - notify all participants and close room
                room_id = data.get("room_id")
                if room_id:
                    room = manager.get_call_room(room_id)
                    if room:
                        # Notify all participants
                        for participant_id in room["participants"]:
                            await manager.send_personal_message(
                                {
                                    "type": "call_ended",
                                    "room_id": room_id,
                                    "ended_by": user_id
                                },
                                participant_id
                            )
                        # Remove room
                        if room_id in manager.call_rooms:
                            del manager.call_rooms[room_id]
                    
                    # Update call record
                    await db.calls.update_one(
                        {"id": room_id},
                        {"$set": {"status": "ended", "ended_at": datetime.utcnow()}}
                    )
            
            elif msg_type == "call_signal":
                # Legacy call signal (for backward compatibility)
                target_id = data.get("target_id")
                signal_data = data.get("signal")
                if target_id:
                    await manager.send_personal_message(
                        {"type": "call_signal", "from_id": user_id, "signal": signal_data},
                        target_id
                    )
    
    except WebSocketDisconnect:
        manager.disconnect(user_id)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Health check
@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ConnectX API"}
