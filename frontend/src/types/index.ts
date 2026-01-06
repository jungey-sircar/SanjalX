export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  status_message: string;
  profile_photo: string | null;
  phone_number: string | null;
  created_at: string;
  is_online: boolean;
}

export interface DeviceContact {
  id: string;
  name: string;
  phoneNumbers: string[];
  image?: string;
}

export interface MatchedContact {
  phone_number: string;
  is_registered: boolean;
  user: User | null;
  deviceContact?: DeviceContact;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  group_id: string | null;
  content: string;
  message_type: 'text' | 'image' | 'voice' | 'video';
  created_at: string;
  read: boolean;
  translated_content?: string;
}

export interface Conversation {
  user: User;
  last_message: Message;
  unread_count: number;
}

export interface Group {
  id: string;
  name: string;
  creator_id: string;
  member_ids: string[];
  group_photo: string | null;
  created_at: string;
}

export interface Call {
  id: string;
  caller_id: string;
  receiver_id: string;
  call_type: 'voice' | 'video';
  status: 'pending' | 'accepted' | 'rejected' | 'ended' | 'missed';
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  sender_id: string;
  receiver_id: string;
  amount: number;
  note: string | null;
  status: 'completed' | 'pending' | 'failed';
  created_at: string;
}
