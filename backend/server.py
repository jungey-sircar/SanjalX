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
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
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
    # Voice message metadata
    audio_duration: Optional[float] = None  # Duration in seconds
    audio_waveform: Optional[List[float]] = None  # Waveform data for visualization

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

# ============== VOICE MESSAGE MODELS ==============

class VoiceMessageCreate(BaseModel):
    receiver_id: str
    audio_data: str  # Base64 encoded audio data
    duration: float  # Duration in seconds
    waveform: Optional[List[float]] = None  # Waveform visualization data
    group_id: Optional[str] = None

class VoiceMessageResponse(BaseModel):
    id: str
    sender_id: str
    receiver_id: Optional[str] = None
    group_id: Optional[str] = None
    audio_url: str  # Base64 audio or URL
    duration: float
    waveform: Optional[List[float]] = None
    created_at: datetime

# ============== GIFT PACKET MODELS ==============

class GiftPacketCreate(BaseModel):
    chat_id: str  # receiver_id for 1:1, group_id for group
    total_amount: float
    gift_type: str = "direct"  # direct, equal, first_claim
    total_slots: int = 1  # For equal split mode
    message: Optional[str] = None
    is_group: bool = False

class GiftPacketResponse(BaseModel):
    id: str
    sender_id: str
    sender_name: Optional[str] = None
    chat_id: str
    total_amount: float
    remaining_amount: float
    gift_type: str
    total_slots: int
    claimed_slots: int
    status: str  # active, completed, expired
    message: Optional[str] = None
    is_group: bool = False
    created_at: datetime
    expires_at: datetime

class GiftClaimResponse(BaseModel):
    id: str
    packet_id: str
    user_id: str
    user_name: Optional[str] = None
    amount: float
    created_at: datetime

class GiftClaimResult(BaseModel):
    success: bool
    amount: float = 0.0
    message: str = ""
    claim: Optional[GiftClaimResponse] = None
    packet: Optional[GiftPacketResponse] = None

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
    update_dict = {}
    for k, v in update_data.dict(exclude_unset=True).items():
        # Handle explicit None for profile_photo (to remove photo)
        if k == 'profile_photo' and v is None:
            update_dict[k] = None
        elif v is not None:
            update_dict[k] = v
    
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
                {"email": {"$regex": query, "$options": "i"}},
                {"phone_number": {"$regex": query, "$options": "i"}}
            ]}
        ]
    }).to_list(50)
    return [user_to_response(u) for u in users]

class PhoneSearchRequest(BaseModel):
    phone_numbers: List[str]

@api_router.post("/users/search-by-phones", response_model=List[UserResponse])
async def search_users_by_phones(request: PhoneSearchRequest, current_user: dict = Depends(get_current_user)):
    """Search for users by multiple phone numbers (for phone contacts sync)."""
    if not request.phone_numbers:
        return []
    
    # Normalize phone numbers - remove spaces, dashes, and keep only digits
    normalized_numbers = []
    for phone in request.phone_numbers:
        # Remove all non-digit characters except +
        normalized = ''.join(c for c in phone if c.isdigit() or c == '+')
        if normalized:
            normalized_numbers.append(normalized)
            # Also add versions without country code
            if normalized.startswith('+'):
                # Remove + and first 1-3 digits (country code)
                without_plus = normalized[1:]
                normalized_numbers.append(without_plus)
                # Try removing common country code lengths
                for length in [1, 2, 3]:
                    if len(without_plus) > length:
                        normalized_numbers.append(without_plus[length:])
    
    if not normalized_numbers:
        return []
    
    # Search for users with matching phone numbers
    regex_patterns = [{"phone_number": {"$regex": f".*{num[-10:]}.*"}} for num in normalized_numbers if len(num) >= 7]
    
    if not regex_patterns:
        return []
    
    users = await db.users.find({
        "$and": [
            {"id": {"$ne": current_user["id"]}},
            {"phone_number": {"$exists": True, "$ne": None, "$ne": ""}},
            {"$or": regex_patterns}
        ]
    }).to_list(100)
    
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

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    group_photo: Optional[str] = None

class GroupMemberResponse(BaseModel):
    id: str
    username: str
    display_name: str
    profile_photo: Optional[str] = None
    is_admin: bool = False
    is_online: bool = False

class GroupDetailResponse(BaseModel):
    id: str
    name: str
    creator_id: str
    admin_ids: List[str]
    member_ids: List[str]
    group_photo: Optional[str] = None
    created_at: datetime
    members: List[GroupMemberResponse] = []

@api_router.post("/groups", response_model=GroupResponse)
async def create_group(group_data: GroupCreate, current_user: dict = Depends(get_current_user)):
    if len(group_data.member_ids) < 1:
        raise HTTPException(status_code=400, detail="Group must have at least 1 other member")
    
    group_id = str(uuid.uuid4())
    member_ids = list(set([current_user["id"]] + group_data.member_ids))
    
    group = {
        "id": group_id,
        "name": group_data.name,
        "creator_id": current_user["id"],
        "admin_ids": [current_user["id"]],  # Creator is the first admin
        "member_ids": member_ids,
        "group_photo": group_data.group_photo,
        "created_at": datetime.utcnow()
    }
    await db.groups.insert_one(group)
    
    # Notify all members about the new group
    creator_name = current_user.get("display_name", current_user.get("username"))
    for member_id in member_ids:
        if member_id != current_user["id"]:
            await manager.send_personal_message(
                {
                    "type": "group_created",
                    "group_id": group_id,
                    "group_name": group_data.name,
                    "created_by": creator_name
                },
                member_id
            )
    
    return GroupResponse(**group)

@api_router.get("/groups", response_model=List[GroupResponse])
async def get_groups(current_user: dict = Depends(get_current_user)):
    groups = await db.groups.find({"member_ids": current_user["id"]}).to_list(100)
    return [GroupResponse(**g) for g in groups]

@api_router.get("/groups/{group_id}", response_model=GroupDetailResponse)
async def get_group(group_id: str, current_user: dict = Depends(get_current_user)):
    group = await db.groups.find_one({"id": group_id})
    if not group or current_user["id"] not in group["member_ids"]:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Get member details
    members = await db.users.find({"id": {"$in": group["member_ids"]}}).to_list(100)
    admin_ids = group.get("admin_ids", [group["creator_id"]])
    
    members_response = []
    for m in members:
        members_response.append(GroupMemberResponse(
            id=m["id"],
            username=m["username"],
            display_name=m.get("display_name", m["username"]),
            profile_photo=m.get("profile_photo"),
            is_admin=m["id"] in admin_ids,
            is_online=m.get("is_online", False)
        ))
    
    return GroupDetailResponse(
        id=group["id"],
        name=group["name"],
        creator_id=group["creator_id"],
        admin_ids=admin_ids,
        member_ids=group["member_ids"],
        group_photo=group.get("group_photo"),
        created_at=group["created_at"],
        members=members_response
    )

@api_router.put("/groups/{group_id}", response_model=GroupResponse)
async def update_group(group_id: str, update_data: GroupUpdate, current_user: dict = Depends(get_current_user)):
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    admin_ids = group.get("admin_ids", [group["creator_id"]])
    if current_user["id"] not in admin_ids:
        raise HTTPException(status_code=403, detail="Only admins can update group")
    
    update_dict = {}
    if update_data.name is not None:
        update_dict["name"] = update_data.name
    if update_data.group_photo is not None:
        update_dict["group_photo"] = update_data.group_photo
    
    if update_dict:
        await db.groups.update_one({"id": group_id}, {"$set": update_dict})
        
        # Notify all members about the update
        for member_id in group["member_ids"]:
            await manager.send_personal_message(
                {
                    "type": "group_updated",
                    "group_id": group_id,
                    "updates": update_dict
                },
                member_id
            )
    
    updated_group = await db.groups.find_one({"id": group_id})
    return GroupResponse(**updated_group)

@api_router.post("/groups/{group_id}/members/{user_id}")
async def add_group_member(group_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    admin_ids = group.get("admin_ids", [group["creator_id"]])
    if current_user["id"] not in admin_ids:
        raise HTTPException(status_code=403, detail="Only admins can add members")
    
    if user_id in group["member_ids"]:
        raise HTTPException(status_code=400, detail="User is already a member")
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.groups.update_one(
        {"id": group_id},
        {"$push": {"member_ids": user_id}}
    )
    
    # Notify all members about the new member
    user_name = user.get("display_name", user.get("username"))
    for member_id in group["member_ids"]:
        await manager.send_personal_message(
            {
                "type": "member_added",
                "group_id": group_id,
                "user_id": user_id,
                "user_name": user_name
            },
            member_id
        )
    
    # Notify the new member
    await manager.send_personal_message(
        {
            "type": "added_to_group",
            "group_id": group_id,
            "group_name": group["name"]
        },
        user_id
    )
    
    return {"message": "Member added successfully"}

@api_router.delete("/groups/{group_id}/members/{user_id}")
async def remove_group_member(group_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    admin_ids = group.get("admin_ids", [group["creator_id"]])
    
    # Only admins can remove other members (but anyone can remove themselves)
    if user_id != current_user["id"] and current_user["id"] not in admin_ids:
        raise HTTPException(status_code=403, detail="Only admins can remove members")
    
    if user_id not in group["member_ids"]:
        raise HTTPException(status_code=400, detail="User is not a member")
    
    # Get user info before removal
    user = await db.users.find_one({"id": user_id})
    user_name = user.get("display_name", user.get("username")) if user else "Unknown"
    
    # Remove from member_ids
    new_member_ids = [m for m in group["member_ids"] if m != user_id]
    
    # If last admin leaves, assign new admin to the next member
    new_admin_ids = [a for a in admin_ids if a != user_id]
    if len(new_admin_ids) == 0 and len(new_member_ids) > 0:
        new_admin_ids = [new_member_ids[0]]
    
    # If no members left, delete the group
    if len(new_member_ids) == 0:
        await db.groups.delete_one({"id": group_id})
        return {"message": "Group deleted (no members left)"}
    
    await db.groups.update_one(
        {"id": group_id},
        {"$set": {"member_ids": new_member_ids, "admin_ids": new_admin_ids}}
    )
    
    # Notify remaining members
    for member_id in new_member_ids:
        await manager.send_personal_message(
            {
                "type": "member_removed",
                "group_id": group_id,
                "user_id": user_id,
                "user_name": user_name,
                "is_self_leave": user_id == current_user["id"]
            },
            member_id
        )
    
    # Notify the removed user
    await manager.send_personal_message(
        {
            "type": "removed_from_group",
            "group_id": group_id,
            "group_name": group["name"]
        },
        user_id
    )
    
    return {"message": "Member removed successfully"}

@api_router.post("/groups/{group_id}/admins/{user_id}")
async def make_admin(group_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    admin_ids = group.get("admin_ids", [group["creator_id"]])
    if current_user["id"] not in admin_ids:
        raise HTTPException(status_code=403, detail="Only admins can promote to admin")
    
    if user_id not in group["member_ids"]:
        raise HTTPException(status_code=400, detail="User is not a member")
    
    if user_id in admin_ids:
        raise HTTPException(status_code=400, detail="User is already an admin")
    
    admin_ids.append(user_id)
    await db.groups.update_one({"id": group_id}, {"$set": {"admin_ids": admin_ids}})
    
    return {"message": "User is now an admin"}

@api_router.delete("/groups/{group_id}/admins/{user_id}")
async def remove_admin(group_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    admin_ids = group.get("admin_ids", [group["creator_id"]])
    if current_user["id"] not in admin_ids:
        raise HTTPException(status_code=403, detail="Only admins can demote admins")
    
    if user_id not in admin_ids:
        raise HTTPException(status_code=400, detail="User is not an admin")
    
    if len(admin_ids) <= 1:
        raise HTTPException(status_code=400, detail="Cannot remove the last admin")
    
    admin_ids.remove(user_id)
    await db.groups.update_one({"id": group_id}, {"$set": {"admin_ids": admin_ids}})
    
    return {"message": "Admin removed"}

@api_router.get("/groups/{group_id}/messages", response_model=List[MessageResponse])
async def get_group_messages(group_id: str, current_user: dict = Depends(get_current_user), limit: int = 100):
    group = await db.groups.find_one({"id": group_id})
    if not group or current_user["id"] not in group["member_ids"]:
        raise HTTPException(status_code=404, detail="Group not found")
    
    messages = await db.messages.find({"group_id": group_id}).sort("created_at", -1).limit(limit).to_list(limit)
    return [MessageResponse(**m) for m in reversed(messages)]

@api_router.post("/groups/{group_id}/messages", response_model=MessageResponse)
async def send_group_message(group_id: str, message: MessageCreate, current_user: dict = Depends(get_current_user)):
    group = await db.groups.find_one({"id": group_id})
    if not group or current_user["id"] not in group["member_ids"]:
        raise HTTPException(status_code=404, detail="Group not found")
    
    msg_id = str(uuid.uuid4())
    now = datetime.utcnow()
    msg = {
        "id": msg_id,
        "sender_id": current_user["id"],
        "receiver_id": None,
        "group_id": group_id,
        "content": message.content,
        "message_type": message.message_type,
        "created_at": now,
        "read": False
    }
    await db.messages.insert_one(msg)
    
    # Broadcast to all group members
    msg_ws = dict(msg)
    msg_ws["created_at"] = now.isoformat()
    msg_ws["sender_name"] = current_user.get("display_name", current_user.get("username"))
    msg_ws["sender_photo"] = current_user.get("profile_photo")
    
    for member_id in group["member_ids"]:
        if member_id != current_user["id"]:
            await manager.send_personal_message(
                {"type": "new_message", "data": msg_ws},
                member_id
            )
    
    # Confirm to sender
    await manager.send_personal_message(
        {"type": "message_sent", "data": msg_ws},
        current_user["id"]
    )
    
    return MessageResponse(**msg)

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

# ============== GIFT PACKET ROUTES ==============

async def _ensure_wallet(user_id: str) -> dict:
    """Ensure user has a wallet, create if not exists."""
    wallet = await db.wallets.find_one({"user_id": user_id})
    if not wallet:
        wallet = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "balance": 1000.0,
            "created_at": datetime.utcnow()
        }
        await db.wallets.insert_one(wallet)
    return wallet

async def _check_and_expire_packet(packet: dict) -> dict:
    """Check if a packet has expired and process refund if needed."""
    if packet["status"] == "active" and datetime.utcnow() > packet["expires_at"]:
        remaining = packet["remaining_amount"]
        # Refund remaining to sender
        if remaining > 0:
            await db.wallets.update_one(
                {"user_id": packet["sender_id"]},
                {"$inc": {"balance": remaining}}
            )
            # Record refund transaction
            refund_tx = {
                "id": str(uuid.uuid4()),
                "sender_id": "system",
                "receiver_id": packet["sender_id"],
                "amount": remaining,
                "note": f"Refund for expired gift packet",
                "status": "completed",
                "related_packet_id": packet["id"],
                "tx_type": "refund",
                "created_at": datetime.utcnow()
            }
            await db.transactions.insert_one(refund_tx)
        
        # Mark as expired
        await db.gift_packets.update_one(
            {"id": packet["id"]},
            {"$set": {"status": "expired", "remaining_amount": 0}}
        )
        packet["status"] = "expired"
        packet["remaining_amount"] = 0
        
        # Send WebSocket notification
        try:
            await manager.send_personal_message(
                {"type": "gift_expired", "packet_id": packet["id"]},
                packet["sender_id"]
            )
        except:
            pass
    return packet

@api_router.post("/gifts/send")
async def send_gift_packet(gift: GiftPacketCreate, current_user: dict = Depends(get_current_user)):
    """Create and send a gift packet. Deducts from sender's wallet atomically."""
    
    # Validation
    if gift.total_amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if gift.total_amount < 0.01:
        raise HTTPException(status_code=400, detail="Minimum gift amount is $0.01")
    if gift.gift_type not in ("direct", "equal", "first_claim"):
        raise HTTPException(status_code=400, detail="Invalid gift type")
    if gift.gift_type == "equal" and gift.total_slots < 1:
        raise HTTPException(status_code=400, detail="Must have at least 1 slot")
    if gift.gift_type == "direct":
        gift.total_slots = 1
    if gift.gift_type == "first_claim":
        gift.total_slots = 1  # Only one person can claim
    
    sender_id = current_user["id"]
    sender_name = current_user.get("display_name", current_user.get("username", "Unknown"))
    
    # Check balance atomically: find wallet and decrement only if sufficient
    result = await db.wallets.find_one_and_update(
        {"user_id": sender_id, "balance": {"$gte": gift.total_amount}},
        {"$inc": {"balance": -gift.total_amount}},
        return_document=True
    )
    
    if not result:
        # Check if wallet exists
        wallet = await _ensure_wallet(sender_id)
        if wallet["balance"] < gift.total_amount:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        # Retry after ensuring wallet
        result = await db.wallets.find_one_and_update(
            {"user_id": sender_id, "balance": {"$gte": gift.total_amount}},
            {"$inc": {"balance": -gift.total_amount}},
            return_document=True
        )
        if not result:
            raise HTTPException(status_code=400, detail="Insufficient balance")
    
    # Create the gift packet
    packet_id = str(uuid.uuid4())
    now = datetime.utcnow()
    packet = {
        "id": packet_id,
        "sender_id": sender_id,
        "sender_name": sender_name,
        "chat_id": gift.chat_id,
        "total_amount": gift.total_amount,
        "remaining_amount": gift.total_amount,
        "gift_type": gift.gift_type,
        "total_slots": gift.total_slots,
        "claimed_slots": 0,
        "status": "active",
        "message": gift.message or "Sent you a gift!",
        "is_group": gift.is_group,
        "created_at": now,
        "expires_at": now + timedelta(hours=24)
    }
    await db.gift_packets.insert_one(packet)
    
    # Record debit transaction
    debit_tx = {
        "id": str(uuid.uuid4()),
        "sender_id": sender_id,
        "receiver_id": gift.chat_id,
        "amount": gift.total_amount,
        "note": f"Gift packet: {gift.message or 'Sent you a gift!'}",
        "status": "completed",
        "related_packet_id": packet_id,
        "tx_type": "gift_sent",
        "created_at": now
    }
    await db.transactions.insert_one(debit_tx)
    
    # Create a special chat message for the gift packet
    msg_id = str(uuid.uuid4())
    gift_msg = {
        "id": msg_id,
        "sender_id": sender_id,
        "receiver_id": gift.chat_id if not gift.is_group else None,
        "group_id": gift.chat_id if gift.is_group else None,
        "content": json.dumps({
            "packet_id": packet_id,
            "message": packet["message"],
            "gift_type": gift.gift_type,
            "total_amount": gift.total_amount,
            "total_slots": gift.total_slots,
            "sender_name": sender_name
        }),
        "message_type": "gift_packet",
        "created_at": now,
        "read": False
    }
    await db.messages.insert_one(gift_msg)
    
    # Send via WebSocket
    msg_ws = dict(gift_msg)
    msg_ws["created_at"] = now.isoformat()
    
    if gift.is_group:
        group = await db.groups.find_one({"id": gift.chat_id})
        if group:
            await manager.broadcast_to_users(
                {"type": "new_message", "data": msg_ws},
                [m for m in group["member_ids"] if m != sender_id]
            )
    else:
        await manager.send_personal_message(
            {"type": "new_message", "data": msg_ws},
            gift.chat_id
        )
    
    # Confirm to sender
    await manager.send_personal_message(
        {"type": "message_sent", "data": msg_ws},
        sender_id
    )
    
    # Also send gift_sent event
    await manager.send_personal_message(
        {"type": "gift_sent", "packet_id": packet_id, "amount": gift.total_amount},
        sender_id
    )
    
    return GiftPacketResponse(**{
        **packet,
        "created_at": now,
        "expires_at": packet["expires_at"]
    })

@api_router.post("/gifts/{packet_id}/claim")
async def claim_gift_packet(packet_id: str, current_user: dict = Depends(get_current_user)):
    """Claim a gift packet. Uses atomic operations for concurrency safety."""
    
    user_id = current_user["id"]
    user_name = current_user.get("display_name", current_user.get("username", "Unknown"))
    
    # Get the packet
    packet = await db.gift_packets.find_one({"id": packet_id})
    if not packet:
        raise HTTPException(status_code=404, detail="Gift packet not found")
    
    # Check expiry
    packet = await _check_and_expire_packet(packet)
    
    if packet["status"] != "active":
        return GiftClaimResult(
            success=False,
            message=f"This gift packet is {packet['status']}"
        )
    
    # Sender cannot claim their own gift
    if packet["sender_id"] == user_id:
        return GiftClaimResult(success=False, message="Cannot claim your own gift")
    
    # Check if already claimed by this user
    existing_claim = await db.gift_claims.find_one({
        "packet_id": packet_id, "user_id": user_id
    })
    if existing_claim:
        return GiftClaimResult(
            success=False,
            message="You already claimed this gift",
            claim=GiftClaimResponse(**existing_claim)
        )
    
    # Calculate claim amount based on type
    claim_amount = 0.0
    
    if packet["gift_type"] == "direct":
        claim_amount = packet["remaining_amount"]
    
    elif packet["gift_type"] == "equal":
        # Equal split: total / total_slots
        claim_amount = round(packet["total_amount"] / packet["total_slots"], 2)
        # Last person gets remainder to handle rounding
        if packet["claimed_slots"] == packet["total_slots"] - 1:
            claim_amount = round(packet["remaining_amount"], 2)
    
    elif packet["gift_type"] == "first_claim":
        claim_amount = packet["remaining_amount"]
    
    if claim_amount <= 0:
        return GiftClaimResult(success=False, message="No amount available to claim")
    
    # ATOMIC: Update packet - decrement remaining, increment claimed
    # Only if still active and has remaining amount
    update_filter = {
        "id": packet_id,
        "status": "active",
        "remaining_amount": {"$gte": claim_amount}
    }
    
    # For first_claim, also ensure claimed_slots is still 0
    if packet["gift_type"] == "first_claim":
        update_filter["claimed_slots"] = 0
    
    # For equal split, ensure not exceeded total_slots
    if packet["gift_type"] == "equal":
        update_filter["claimed_slots"] = {"$lt": packet["total_slots"]}
    
    new_remaining = round(packet["remaining_amount"] - claim_amount, 2)
    new_claimed = packet["claimed_slots"] + 1
    
    # Check if packet should be completed
    is_completed = False
    if packet["gift_type"] == "direct":
        is_completed = True
    elif packet["gift_type"] == "first_claim":
        is_completed = True
    elif packet["gift_type"] == "equal" and new_claimed >= packet["total_slots"]:
        is_completed = True
    
    update_set = {
        "remaining_amount": max(new_remaining, 0),
        "claimed_slots": new_claimed,
    }
    if is_completed:
        update_set["status"] = "completed"
    
    result = await db.gift_packets.find_one_and_update(
        update_filter,
        {"$set": update_set},
        return_document=True
    )
    
    if not result:
        # Race condition or already claimed
        return GiftClaimResult(
            success=False,
            message="This gift has already been claimed or is no longer available"
        )
    
    # Create claim record
    claim_id = str(uuid.uuid4())
    now = datetime.utcnow()
    claim = {
        "id": claim_id,
        "packet_id": packet_id,
        "user_id": user_id,
        "user_name": user_name,
        "amount": claim_amount,
        "created_at": now
    }
    await db.gift_claims.insert_one(claim)
    
    # Credit receiver wallet
    receiver_wallet = await _ensure_wallet(user_id)
    await db.wallets.update_one(
        {"user_id": user_id},
        {"$inc": {"balance": claim_amount}}
    )
    
    # Record credit transaction
    credit_tx = {
        "id": str(uuid.uuid4()),
        "sender_id": packet["sender_id"],
        "receiver_id": user_id,
        "amount": claim_amount,
        "note": f"Gift received from {packet.get('sender_name', 'Unknown')}",
        "status": "completed",
        "related_packet_id": packet_id,
        "tx_type": "gift_received",
        "created_at": now
    }
    await db.transactions.insert_one(credit_tx)
    
    # Send WebSocket events
    # Notify claimer
    await manager.send_personal_message(
        {
            "type": "gift_claimed",
            "packet_id": packet_id,
            "amount": claim_amount,
            "user_id": user_id,
            "user_name": user_name
        },
        user_id
    )
    
    # Notify sender
    await manager.send_personal_message(
        {
            "type": "gift_claimed",
            "packet_id": packet_id,
            "amount": claim_amount,
            "user_id": user_id,
            "user_name": user_name
        },
        packet["sender_id"]
    )
    
    # If completed, send gift_completed event
    if is_completed:
        completed_event = {
            "type": "gift_completed",
            "packet_id": packet_id
        }
        await manager.send_personal_message(completed_event, packet["sender_id"])
        if not packet["is_group"]:
            await manager.send_personal_message(completed_event, packet["chat_id"])
    
    # Build response
    updated_packet = await db.gift_packets.find_one({"id": packet_id})
    
    return GiftClaimResult(
        success=True,
        amount=claim_amount,
        message=f"You received ${claim_amount:.2f}!",
        claim=GiftClaimResponse(**claim),
        packet=GiftPacketResponse(**updated_packet) if updated_packet else None
    )

@api_router.get("/gifts/{packet_id}")
async def get_gift_packet(packet_id: str, current_user: dict = Depends(get_current_user)):
    """Get gift packet details including claims."""
    packet = await db.gift_packets.find_one({"id": packet_id})
    if not packet:
        raise HTTPException(status_code=404, detail="Gift packet not found")
    
    # Check expiry
    packet = await _check_and_expire_packet(packet)
    
    # Get claims
    claims = await db.gift_claims.find({"packet_id": packet_id}).sort("created_at", 1).to_list(100)
    
    # Check if current user already claimed
    user_claim = next((c for c in claims if c["user_id"] == current_user["id"]), None)
    
    return {
        "packet": GiftPacketResponse(**packet),
        "claims": [GiftClaimResponse(**c) for c in claims],
        "user_claimed": user_claim is not None,
        "user_claim": GiftClaimResponse(**user_claim) if user_claim else None,
        "is_sender": packet["sender_id"] == current_user["id"]
    }

@api_router.get("/gifts/{packet_id}/claims")
async def get_gift_claims(packet_id: str, current_user: dict = Depends(get_current_user)):
    """Get list of claims for a gift packet."""
    packet = await db.gift_packets.find_one({"id": packet_id})
    if not packet:
        raise HTTPException(status_code=404, detail="Gift packet not found")
    
    claims = await db.gift_claims.find({"packet_id": packet_id}).sort("created_at", 1).to_list(100)
    return [GiftClaimResponse(**c) for c in claims]

# ============== TRANSLATION ROUTE ==============

class BidirectionalTranslateRequest(BaseModel):
    text: str
    message_id: Optional[str] = None
    direction: str = "to_english"  # "to_english", "to_original", "detect"

class TranslationResponse(BaseModel):
    original: str
    translated: str
    source_language: str
    target_language: str
    direction: str
    cached: bool = False

@api_router.post("/translate")
async def translate_text(request: TranslateRequest, current_user: dict = Depends(get_current_user)):
    """Legacy translation endpoint for simple translations."""
    language_names = {
        "en": "English",
        "ne": "Nepali",
        "hi": "Hindi",
        "es": "Spanish",
        "fr": "French",
        "de": "German",
        "zh": "Chinese",
        "ja": "Japanese",
        "ko": "Korean",
        "ar": "Arabic",
        "ru": "Russian",
        "pt": "Portuguese"
    }
    
    target_lang_name = language_names.get(request.target_language, "English")
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"translate-{current_user['id']}-{uuid.uuid4()}",
            system_message=f"You are a translator. Translate the following text to {target_lang_name}. Only respond with the translation, nothing else. Preserve emojis, formatting, and tone."
        ).with_model("openai", "gpt-4.1-mini")
        
        user_message = UserMessage(text=request.text)
        translated = await chat.send_message(user_message)
        
        return {"original": request.text, "translated": translated.strip(), "target_language": request.target_language}
    except Exception as e:
        logger.error(f"Translation error: {str(e)}")
        return {"original": request.text, "translated": f"[Translation unavailable] {request.text}", "target_language": request.target_language}

@api_router.post("/translate/bidirectional", response_model=TranslationResponse)
async def bidirectional_translate(request: BidirectionalTranslateRequest, current_user: dict = Depends(get_current_user)):
    """
    Bidirectional translation with language detection and caching.
    
    Directions:
    - "to_english": Detect source language and translate to English
    - "to_original": Translate from English back to the detected original language
    - "detect": Just detect the language without translating
    """
    
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    # Check cache first
    cache_key = f"{request.text}_{request.direction}"
    cached_translation = await db.translation_cache.find_one({"cache_key": cache_key})
    
    if cached_translation:
        return TranslationResponse(
            original=cached_translation["original"],
            translated=cached_translation["translated"],
            source_language=cached_translation["source_language"],
            target_language=cached_translation["target_language"],
            direction=request.direction,
            cached=True
        )
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        if request.direction == "detect":
            # Just detect the language
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"detect-{current_user['id']}-{uuid.uuid4()}",
                system_message="""You are a language detection expert. Analyze the given text and respond with ONLY the ISO 639-1 language code (e.g., 'en', 'ne', 'hi', 'es', 'fr', 'zh', 'ja', 'ko', 'ar', 'ru'). 
                
If it's English, respond: en
If it's Nepali, respond: ne
If it's Hindi, respond: hi
If it's Spanish, respond: es
If it's French, respond: fr
If it's Chinese, respond: zh
If it's Japanese, respond: ja
If it's Korean, respond: ko
If it's Arabic, respond: ar
If it's Russian, respond: ru

Only respond with the 2-letter language code, nothing else."""
            ).with_model("openai", "gpt-4.1-mini")
            
            user_message = UserMessage(text=request.text)
            detected_lang = await chat.send_message(user_message)
            detected_lang = detected_lang.strip().lower()[:2]
            
            result = TranslationResponse(
                original=request.text,
                translated=request.text,
                source_language=detected_lang,
                target_language=detected_lang,
                direction="detect",
                cached=False
            )
            
        elif request.direction == "to_english":
            # Step 1: Detect language
            detect_chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"detect-{current_user['id']}-{uuid.uuid4()}",
                system_message="You are a language detection expert. Respond with ONLY the ISO 639-1 language code (e.g., 'en', 'ne', 'hi', 'es', 'fr', 'zh', 'ja'). Only respond with the 2-letter code, nothing else."
            ).with_model("openai", "gpt-4.1-mini")
            
            detect_msg = UserMessage(text=f"Detect the language of: {request.text}")
            detected_lang = await detect_chat.send_message(detect_msg)
            detected_lang = detected_lang.strip().lower()[:2]
            
            # If already English, return as is
            if detected_lang == "en":
                result = TranslationResponse(
                    original=request.text,
                    translated=request.text,
                    source_language="en",
                    target_language="en",
                    direction="to_english",
                    cached=False
                )
            else:
                # Step 2: Translate to English
                translate_chat = LlmChat(
                    api_key=EMERGENT_LLM_KEY,
                    session_id=f"translate-{current_user['id']}-{uuid.uuid4()}",
                    system_message="""You are an expert translator. Translate the given text to English.

Rules:
1. Only respond with the translation, nothing else
2. Preserve all emojis exactly as they appear
3. Maintain the tone and emotion of the original
4. Keep proper nouns, names, and special terms as appropriate
5. If there's slang, translate to equivalent English slang when possible"""
                ).with_model("openai", "gpt-4.1-mini")
                
                translate_msg = UserMessage(text=request.text)
                translated = await translate_chat.send_message(translate_msg)
                
                result = TranslationResponse(
                    original=request.text,
                    translated=translated.strip(),
                    source_language=detected_lang,
                    target_language="en",
                    direction="to_english",
                    cached=False
                )
                
        elif request.direction == "to_original":
            # Translate English back to original language
            # We need the original language - try to extract from text patterns or default
            # For reverse translation, we need to know the target language
            # The frontend should pass this info, but we'll default to Nepali if not clear
            
            # First, try to detect if there's a stored translation for this message
            if request.message_id:
                original_translation = await db.translation_cache.find_one({
                    "message_id": request.message_id,
                    "direction": "to_english"
                })
                if original_translation:
                    target_lang = original_translation["source_language"]
                else:
                    target_lang = "ne"  # Default to Nepali
            else:
                target_lang = "ne"  # Default to Nepali
            
            language_names = {
                "ne": "Nepali",
                "hi": "Hindi",
                "es": "Spanish",
                "fr": "French",
                "de": "German",
                "zh": "Chinese (Simplified)",
                "ja": "Japanese",
                "ko": "Korean",
                "ar": "Arabic",
                "ru": "Russian",
                "pt": "Portuguese"
            }
            
            target_name = language_names.get(target_lang, "Nepali")
            
            translate_chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"reverse-{current_user['id']}-{uuid.uuid4()}",
                system_message=f"""You are an expert translator. Translate the given English text to {target_name}.

Rules:
1. Only respond with the translation, nothing else
2. Preserve all emojis exactly as they appear
3. Maintain the tone and emotion of the original
4. Use natural, fluent {target_name} expression
5. Keep proper nouns and names as appropriate"""
            ).with_model("openai", "gpt-4.1-mini")
            
            translate_msg = UserMessage(text=request.text)
            translated = await translate_chat.send_message(translate_msg)
            
            result = TranslationResponse(
                original=request.text,
                translated=translated.strip(),
                source_language="en",
                target_language=target_lang,
                direction="to_original",
                cached=False
            )
        else:
            raise HTTPException(status_code=400, detail="Invalid direction. Use 'to_english', 'to_original', or 'detect'")
        
        # Cache the result
        cache_doc = {
            "cache_key": cache_key,
            "message_id": request.message_id,
            "original": result.original,
            "translated": result.translated,
            "source_language": result.source_language,
            "target_language": result.target_language,
            "direction": request.direction,
            "user_id": current_user["id"],
            "created_at": datetime.utcnow()
        }
        await db.translation_cache.insert_one(cache_doc)
        
        return result
        
    except Exception as e:
        logger.error(f"Bidirectional translation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")

@api_router.get("/translate/cache/{message_id}")
async def get_cached_translations(message_id: str, current_user: dict = Depends(get_current_user)):
    """Get all cached translations for a message."""
    translations = await db.translation_cache.find({"message_id": message_id}).to_list(10)
    return [
        {
            "direction": t["direction"],
            "original": t["original"],
            "translated": t["translated"],
            "source_language": t["source_language"],
            "target_language": t["target_language"]
        }
        for t in translations
    ]

# ============== VOICE MESSAGE ROUTES ==============

@api_router.post("/messages/voice", response_model=MessageResponse)
async def send_voice_message(voice_msg: VoiceMessageCreate, current_user: dict = Depends(get_current_user)):
    """Send a voice message with audio data."""
    
    # Validate duration
    if voice_msg.duration < 1.0:
        raise HTTPException(status_code=400, detail="Voice message too short (minimum 1 second)")
    if voice_msg.duration > 300:  # 5 minutes max
        raise HTTPException(status_code=400, detail="Voice message too long (maximum 5 minutes)")
    
    # Validate audio data
    if not voice_msg.audio_data or len(voice_msg.audio_data) < 100:
        raise HTTPException(status_code=400, detail="Invalid audio data")
    
    msg_id = str(uuid.uuid4())
    now = datetime.utcnow()
    
    # Create message with voice type
    # Store audio as base64 in content field (similar to images)
    msg = {
        "id": msg_id,
        "sender_id": current_user["id"],
        "receiver_id": voice_msg.receiver_id if not voice_msg.group_id else None,
        "group_id": voice_msg.group_id,
        "content": voice_msg.audio_data,  # Base64 audio
        "message_type": "voice",
        "created_at": now,
        "read": False,
        "audio_duration": voice_msg.duration,
        "audio_waveform": voice_msg.waveform
    }
    await db.messages.insert_one(msg)
    
    # Send via WebSocket for real-time delivery
    msg_ws = dict(msg)
    msg_ws["created_at"] = now.isoformat()
    
    if voice_msg.group_id:
        group = await db.groups.find_one({"id": voice_msg.group_id})
        if group:
            await manager.broadcast_to_users(
                {"type": "new_message", "data": msg_ws},
                [m for m in group["member_ids"] if m != current_user["id"]]
            )
    else:
        await manager.send_personal_message(
            {"type": "new_message", "data": msg_ws},
            voice_msg.receiver_id
        )
    
    # Confirm to sender
    await manager.send_personal_message(
        {"type": "message_sent", "data": msg_ws},
        current_user["id"]
    )
    
    return MessageResponse(**msg)

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
