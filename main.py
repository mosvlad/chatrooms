import os
import json
import uuid
import hashlib
import sqlite3
import datetime
import base64
import urllib.parse
import tornado.ioloop
import tornado.web
import tornado.websocket
import tornado.escape


# Database setup
def init_db():
    conn = sqlite3.connect('messenger.db')
    cursor = conn.cursor()

    # Create users table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        password_hash TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # Create messages table - Add has_image field
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        content TEXT,
        sender_id TEXT,
        sender_name TEXT,
        room_id TEXT DEFAULT 'public',
        recipient_id TEXT DEFAULT NULL,
        is_private BOOLEAN DEFAULT 0,
        has_image BOOLEAN DEFAULT 0,
        image_path TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id),
        FOREIGN KEY (recipient_id) REFERENCES users(id),
        FOREIGN KEY (room_id) REFERENCES rooms(id)
    )
    ''')

    # Create rooms table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE,
        is_private BOOLEAN DEFAULT 0,
        owner_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id)
    )
    ''')

    # Create room_members table for private rooms
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS room_members (
        room_id TEXT,
        user_id TEXT,
        PRIMARY KEY (room_id, user_id),
        FOREIGN KEY (room_id) REFERENCES rooms(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    ''')

    # Insert public room if it doesn't exist
    cursor.execute("INSERT OR IGNORE INTO rooms (id, name, is_private) VALUES ('public', 'Public', 0)")

    conn.commit()
    conn.close()


# Helper functions
def hash_password(password):
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


def get_user_by_credentials(username, password):
    conn = sqlite3.connect('messenger.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM users WHERE username = ? AND password_hash = ?",
                   (username, hash_password(password)))
    user = cursor.fetchone()
    conn.close()

    return dict(user) if user else None


def get_user_by_id(user_id):
    if not user_id:
        return None

    # Print for debugging
    print(f"Looking up user with ID: '{user_id}'")

    conn = sqlite3.connect('messenger.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    conn.close()

    if user:
        print(f"Found user with username: {user['username']}")
    else:
        print(f"No user found with ID: {user_id}")

    return dict(user) if user else None


def get_user_by_username(username):
    conn = sqlite3.connect('messenger.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    conn.close()

    return dict(user) if user else None


def parse_cookie(cookie_string):
    """Parse and decode secure cookie value properly"""
    if not cookie_string:
        return None

    print(f"Parsing cookie string: {cookie_string}")

    cookies = {}
    for part in cookie_string.split(';'):
        part = part.strip()
        if '=' in part:
            name, value = part.split('=', 1)
            name = name.strip()
            value = value.strip()
            cookies[name] = value

    # Get user_id and clean it
    user_id = cookies.get('user_id')
    if user_id:
        # Remove any quotes, URL encoding, etc.
        user_id = user_id.strip('"\'').strip()
        # Handle URL-encoded values
        if '%' in user_id:
            user_id = urllib.parse.unquote(user_id)
        print(f"Extracted user_id from cookie: '{user_id}'")
        return user_id

    print("No user_id found in cookies")
    return None


def get_room_by_id(room_id):
    conn = sqlite3.connect('messenger.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM rooms WHERE id = ?", (room_id,))
    room = cursor.fetchone()
    conn.close()

    return dict(room) if room else None


def get_room_by_name(room_name):
    conn = sqlite3.connect('messenger.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM rooms WHERE name = ?", (room_name,))
    room = cursor.fetchone()
    conn.close()

    return dict(room) if room else None


def get_room_members(room_id):
    conn = sqlite3.connect('messenger.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
    SELECT u.id, u.username 
    FROM users u 
    JOIN room_members rm ON u.id = rm.user_id 
    WHERE rm.room_id = ?
    """, (room_id,))

    members = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return members


def get_user_rooms(user_id):
    conn = sqlite3.connect('messenger.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
    SELECT r.* 
    FROM rooms r 
    LEFT JOIN room_members rm ON r.id = rm.room_id 
    WHERE r.is_private = 0 OR r.owner_id = ? OR rm.user_id = ?
    """, (user_id, user_id))

    rooms = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return rooms


def get_room_messages(room_id, limit=100):
    conn = sqlite3.connect('messenger.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
    SELECT * FROM messages 
    WHERE room_id = ? AND is_private = 0
    ORDER BY created_at DESC 
    LIMIT ?
    """, (room_id, limit))

    messages = [dict(row) for row in cursor.fetchall()]
    messages.reverse()  # To get chronological order
    conn.close()

    return messages


def get_direct_messages(user_id, other_user_id, limit=100):
    conn = sqlite3.connect('messenger.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
    SELECT * FROM messages 
    WHERE is_private = 1 AND
          ((sender_id = ? AND recipient_id = ?) OR 
           (sender_id = ? AND recipient_id = ?))
    ORDER BY created_at DESC 
    LIMIT ?
    """, (user_id, other_user_id, other_user_id, user_id, limit))

    messages = [dict(row) for row in cursor.fetchall()]
    messages.reverse()  # To get chronological order
    conn.close()

    return messages


def get_all_users():
    conn = sqlite3.connect('messenger.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT id, username FROM users")
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return users


def decode_user_id_from_secure_cookie(cookie_string):
    """
    Extracts and decodes the user_id from Tornado's secure cookie format.
    """
    if not cookie_string or 'user_id=' not in cookie_string:
        return None

    try:
        # Extract the user_id cookie value
        for item in cookie_string.split(';'):
            item = item.strip()
            if item.startswith('user_id='):
                cookie_value = item[len('user_id='):]

                # Split by pipe character
                parts = cookie_value.split('|')

                # We need at least 5 parts for this to be valid
                if len(parts) >= 5:
                    # The value we want is the base64 string in the 5th segment
                    base64_part = parts[4].split(':', 1)
                    if len(base64_part) == 2:
                        # Decode the base64 string to get the actual user_id
                        try:
                            decoded_bytes = base64.b64decode(base64_part[1])
                            user_id = decoded_bytes.decode('utf-8')
                            print(f"Successfully decoded user_id: {user_id}")
                            return user_id
                        except Exception as e:
                            print(f"Error decoding base64: {e}")
    except Exception as e:
        print(f"Error parsing secure cookie: {e}")

    return None


# Handlers
class BaseHandler(tornado.web.RequestHandler):
    def get_current_user(self):
        user_id = self.get_secure_cookie("user_id")
        if not user_id:
            return None

        # Print the secure cookie value for debugging
        print(f"Secure cookie value: {user_id}")

        # Decode the secure cookie
        user_id_str = user_id.decode('utf-8')
        print(f"Decoded user_id: {user_id_str}")

        user = get_user_by_id(user_id_str)
        return user

    def get_current_username(self):
        user = self.get_current_user()
        return user['username'] if user else None


class MainHandler(BaseHandler):
    def get(self):
        current_user = self.get_current_user()
        if current_user:
            print(f"Current user: {current_user['username']} with ID: {current_user['id']}")

        self.render("index.html",
                    username=self.get_current_username(),
                    logged_in=current_user is not None)


class LoginHandler(BaseHandler):
    def post(self):
        username = self.get_argument("username")
        password = self.get_argument("password")

        user = get_user_by_credentials(username, password)
        if user:
            print(f"User logged in: {username} with ID: {user['id']}")
            self.set_secure_cookie("user_id", user["id"])
            self.write({"success": True, "username": user["username"]})
        else:
            self.write({"success": False, "error": "Invalid username or password"})


class LogoutHandler(BaseHandler):
    def post(self):
        self.clear_cookie("user_id")
        self.write({"success": True})


class RegisterHandler(BaseHandler):
    def post(self):
        username = self.get_argument("username")
        password = self.get_argument("password")

        # Check if username exists
        if get_user_by_username(username):
            self.write({"success": False, "error": "Username already exists"})
            return

        user_id = str(uuid.uuid4())
        print(f"Registering new user: {username} with ID: {user_id}")

        conn = sqlite3.connect('messenger.db')
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
            (user_id, username, hash_password(password))
        )
        conn.commit()
        conn.close()

        self.set_secure_cookie("user_id", user_id)
        self.write({"success": True, "username": username})


class RoomHandler(BaseHandler):
    def post(self):
        if not self.get_current_user():
            self.write({"success": False, "error": "You must be logged in to create a room"})
            return

        room_name = self.get_argument("name")
        is_private = self.get_argument("is_private", "false") == "true"

        # Check if room name exists
        if get_room_by_name(room_name):
            self.write({"success": False, "error": "Room name already exists"})
            return

        room_id = str(uuid.uuid4())
        user_id = self.get_current_user()["id"]

        conn = sqlite3.connect('messenger.db')
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO rooms (id, name, is_private, owner_id) VALUES (?, ?, ?, ?)",
            (room_id, room_name, 1 if is_private else 0, user_id)
        )

        # Add creator to room members
        if is_private:
            cursor.execute(
                "INSERT INTO room_members (room_id, user_id) VALUES (?, ?)",
                (room_id, user_id)
            )

        conn.commit()
        conn.close()

        self.write({"success": True, "id": room_id, "name": room_name})


class RoomMemberHandler(BaseHandler):
    def post(self):
        if not self.get_current_user():
            self.write({"success": False, "error": "You must be logged in"})
            return

        room_id = self.get_argument("room_id")
        username = self.get_argument("username")

        room = get_room_by_id(room_id)
        if not room:
            self.write({"success": False, "error": "Room not found"})
            return

        # Only room owner can add members
        if room["owner_id"] != self.get_current_user()["id"]:
            self.write({"success": False, "error": "Only room owner can add members"})
            return

        user = get_user_by_username(username)
        if not user:
            self.write({"success": False, "error": "User not found"})
            return

        conn = sqlite3.connect('messenger.db')
        cursor = conn.cursor()
        try:
            cursor.execute(
                "INSERT INTO room_members (room_id, user_id) VALUES (?, ?)",
                (room_id, user["id"])
            )
            conn.commit()
            self.write({"success": True})
        except sqlite3.IntegrityError:
            self.write({"success": False, "error": "User is already a member"})
        finally:
            conn.close()


class GetRoomsHandler(BaseHandler):
    def get(self):
        user = self.get_current_user()
        if user:
            rooms = get_user_rooms(user["id"])
        else:
            # Anonymous users can only see public rooms
            conn = sqlite3.connect('messenger.db')
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM rooms WHERE is_private = 0")
            rooms = [dict(row) for row in cursor.fetchall()]
            conn.close()

        self.write({"rooms": rooms})


class GetUsersHandler(BaseHandler):
    def get(self):
        if not self.get_current_user():
            self.write({"success": False, "error": "You must be logged in"})
            return

        users = get_all_users()
        self.write({"users": users})


class RoomMembersHandler(BaseHandler):
    def get(self):
        room_id = self.get_argument("room_id")
        members = get_room_members(room_id)
        self.write({"members": members})


class MessagesHandler(BaseHandler):
    def get(self):
        room_id = self.get_argument("room_id", "public")

        # Check if user has access to room
        if room_id != "public":
            room = get_room_by_id(room_id)
            if not room:
                self.write({"success": False, "error": "Room not found"})
                return

            if room["is_private"]:
                user = self.get_current_user()
                if not user:
                    self.write({"success": False, "error": "You must be logged in"})
                    return

                # Check if user is room member
                members = get_room_members(room_id)
                if not any(member["id"] == user["id"] for member in members):
                    self.write({"success": False, "error": "You are not a member of this room"})
                    return

        messages = get_room_messages(room_id)
        self.write({"messages": messages})


class DirectMessagesHandler(BaseHandler):
    def get(self):
        user = self.get_current_user()
        if not user:
            self.write({"success": False, "error": "You must be logged in"})
            return

        other_user_id = self.get_argument("user_id")
        print(f"Loading direct messages between {user['id']} and {other_user_id}")

        messages = get_direct_messages(user["id"], other_user_id)
        print(f"Found {len(messages)} direct messages")

        # Ensure we have the necessary details for both users
        for message in messages:
            # For direct messages, we need recipient_name too
            if message["sender_id"] == user["id"]:
                recipient = get_user_by_id(message["recipient_id"])
                if recipient:
                    message["recipient_name"] = recipient["username"]
            else:
                sender = get_user_by_id(message["sender_id"])
                if sender:
                    message["sender_name"] = sender["username"]

        self.write({"messages": messages})


# New handler for serving uploaded images
class ImageHandler(BaseHandler):
    def get(self, image_id):
        image_path = os.path.join('uploads', image_id)
        if os.path.exists(image_path):
            with open(image_path, 'rb') as f:
                image_data = f.read()

            # Determine content type based on file extension
            content_type = "image/jpeg"  # Default
            if image_id.lower().endswith('.png'):
                content_type = "image/png"
            elif image_id.lower().endswith('.gif'):
                content_type = "image/gif"
            elif image_id.lower().endswith('.webp'):
                content_type = "image/webp"

            self.set_header("Content-Type", content_type)
            self.write(image_data)
        else:
            self.set_status(404)
            self.write("Image not found")


class MessageWebSocketHandler(tornado.websocket.WebSocketHandler):
    waiters = set()

    def check_origin(self, origin):
        return True

    def open(self):
        print("WebSocket connection opened")
        MessageWebSocketHandler.waiters.add(self)

    def on_close(self):
        print("WebSocket connection closed")
        MessageWebSocketHandler.waiters.remove(self)

    def on_message(self, message):
        print(f"WebSocket received message: {message[:100]}...")
        data = json.loads(message)

        user_id = None
        username = "Anonymous"

        # Get user info from cookie if available - IMPROVED COOKIE PARSING
        cookie_header = self.request.headers.get("Cookie")
        if cookie_header:
            print(f"WebSocket cookie header: {cookie_header}")
            user_id = decode_user_id_from_secure_cookie(cookie_header)

            if user_id:
                # Try with original ID
                user = get_user_by_id(user_id)

                # If not found, try to clean the ID
                if not user:
                    print(f"User not found with ID '{user_id}', trying to clean it")
                    # Try a few different cleaning approaches
                    cleaned_id = user_id.strip('"\'').strip()
                    if '%' in cleaned_id:
                        cleaned_id = urllib.parse.unquote(cleaned_id)

                    # Try with standard UUID format
                    if cleaned_id and len(cleaned_id) >= 36:
                        cleaned_id = cleaned_id[:36]  # Extract first 36 chars (UUID length)
                        print(f"Trying with cleaned ID: '{cleaned_id}'")
                        user = get_user_by_id(cleaned_id)
                        if user:
                            user_id = cleaned_id

                if user:
                    username = user["username"]
                    print(f"WebSocket found user: {username} with ID: {user_id}")
                else:
                    print(f"WebSocket: User not found for ID: '{user_id}'")
                    # Print all users for debugging
                    print("Available users:")
                    conn = sqlite3.connect('messenger.db')
                    conn.row_factory = sqlite3.Row
                    cursor = conn.cursor()
                    cursor.execute("SELECT id, username FROM users")
                    all_users = cursor.fetchall()
                    conn.close()
                    for u in all_users:
                        print(f"  ID: '{u['id']}', Username: '{u['username']}'")

        # Custom username for anonymous users
        if username == "Anonymous" and data.get("custom_username"):
            username = f"{data['custom_username']} (Guest)"

        # Handle different message types
        if data["type"] == "chat":
            room_id = data.get("room_id", "public")
            content = data.get("content", "")

            # Check if there's an image included
            has_image = False
            image_path = None

            if "image" in data and data["image"]:
                has_image = True
                image_data = data["image"].split(",")[1]  # Remove the data:image/jpeg;base64, part
                image_binary = base64.b64decode(image_data)

                # Create uploads directory if it doesn't exist
                os.makedirs("uploads", exist_ok=True)

                # Generate a unique filename for the image
                image_filename = f"{str(uuid.uuid4())}.jpg"
                image_path = os.path.join("uploads", image_filename)

                # Save the image
                with open(image_path, "wb") as f:
                    f.write(image_binary)

                # Use just the filename for database storage
                image_path = image_filename

            # Check access to room
            if room_id != "public":
                room = get_room_by_id(room_id)
                if room and room["is_private"] and (
                        not user_id or user_id not in [m["id"] for m in get_room_members(room_id)]):
                    self.write_message({"error": "You don't have access to this room"})
                    return

            # Create message
            message_id = str(uuid.uuid4())
            timestamp = datetime.datetime.now().isoformat()

            conn = sqlite3.connect('messenger.db')
            cursor = conn.cursor()

            # Updated INSERT query to include image fields
            cursor.execute(
                """INSERT INTO messages 
                (id, content, sender_id, sender_name, room_id, has_image, image_path, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (message_id, content, user_id, username, room_id, 1 if has_image else 0, image_path, timestamp)
            )

            conn.commit()
            conn.close()

            # Broadcast to all clients
            message_data = {
                "id": message_id,
                "content": content,
                "sender_id": user_id,
                "sender_name": username,
                "room_id": room_id,
                "has_image": has_image,
                "image_path": image_path,
                "created_at": timestamp
            }

            self.broadcast({"type": "new_message", "message": message_data})

        elif data["type"] == "direct_message":
            if not user_id:
                self.write_message({"error": "You must be logged in to send direct messages"})
                return

            recipient_id = data.get("recipient_id")
            content = data.get("content", "")

            print(f"Processing direct message from {user_id} to {recipient_id}: {content}")

            # Check if there's an image included
            has_image = False
            image_path = None

            if "image" in data and data["image"]:
                has_image = True
                image_data = data["image"].split(",")[1]  # Remove the data:image/jpeg;base64, part
                image_binary = base64.b64decode(image_data)

                # Create uploads directory if it doesn't exist
                os.makedirs("uploads", exist_ok=True)

                # Generate a unique filename for the image
                image_filename = f"{str(uuid.uuid4())}.jpg"
                image_path = os.path.join("uploads", image_filename)

                # Save the image
                with open(image_path, "wb") as f:
                    f.write(image_binary)

                # Use just the filename for database storage
                image_path = image_filename

            # Force lookup all users for debugging
            print("Available users for direct messaging:")
            conn = sqlite3.connect('messenger.db')
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT id, username FROM users")
            all_users = cursor.fetchall()
            conn.close()
            for u in all_users:
                print(f"  ID: '{u['id']}', Username: '{u['username']}'")

            # Check if recipient exists
            recipient = get_user_by_id(recipient_id)
            if not recipient:
                self.write_message({"error": "Recipient not found"})
                return

            # Get sender details with better error handling
            # IMPORTANT FIX: First try to fetch user again directly from database
            conn = sqlite3.connect('messenger.db')
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            sender_row = cursor.fetchone()
            conn.close()

            if sender_row:
                sender = dict(sender_row)
            else:
                # Fall back to previous method
                sender = get_user_by_id(user_id)

            if not sender:
                print(f"Error: Could not find user with ID {user_id}")
                self.write_message({"error": "Sender information not found"})
                return

            print(f"Sender found: {sender['username']}")
            print(f"Recipient found: {recipient['username']}")

            # Create message
            message_id = str(uuid.uuid4())
            timestamp = datetime.datetime.now().isoformat()

            conn = sqlite3.connect('messenger.db')
            cursor = conn.cursor()

            # Updated INSERT query to include image fields
            cursor.execute(
                """INSERT INTO messages 
                (id, content, sender_id, sender_name, recipient_id, is_private, has_image, image_path, created_at) 
                VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)""",
                (message_id, content, user_id, sender["username"], recipient_id, 1 if has_image else 0, image_path,
                 timestamp)
            )

            conn.commit()
            conn.close()

            # Send to sender and recipient
            message_data = {
                "id": message_id,
                "content": content,
                "sender_id": user_id,
                "sender_name": sender["username"],
                "recipient_id": recipient_id,
                "recipient_name": recipient["username"],
                "has_image": has_image,
                "image_path": image_path,
                "created_at": timestamp
            }

            print(f"Message data prepared: {message_data}")
            print(f"Total waiters: {len(MessageWebSocketHandler.waiters)}")

            # Keep track of delivered message count for debugging
            delivered_count = 0

            for waiter in MessageWebSocketHandler.waiters:
                try:
                    # IMPROVED: Better cookie parsing for waiters too
                    waiter_cookie_header = waiter.request.headers.get("Cookie")
                    print(f"Checking waiter cookie: {waiter_cookie_header}")

                    waiter_id = decode_user_id_from_secure_cookie(waiter_cookie_header)

                    # Try cleaning waiter ID too if needed
                    if waiter_id and not get_user_by_id(waiter_id) and len(waiter_id) >= 36:
                        waiter_id = waiter_id[:36]  # Extract first 36 chars (UUID length)

                    if waiter_id:
                        print(f"Waiter ID: {waiter_id}")
                        print(f"Sender ID: {user_id}")
                        print(f"Recipient ID: {recipient_id}")

                        # Check if this waiter should receive the message
                        if waiter_id == user_id or waiter_id == recipient_id:
                            print(f"Sending message to waiter ID: {waiter_id}")
                            waiter.write_message({"type": "new_direct_message", "message": message_data})
                            delivered_count += 1
                except Exception as e:
                    print(f"Error sending message to client: {e}")

            print(f"Message delivered to {delivered_count} waiters")

            # If no delivery happened, try fallback direct delivery
            if delivered_count == 0:
                print("No messages delivered through waiters, trying direct delivery")
                self.write_message({"type": "new_direct_message", "message": message_data})

    def broadcast(self, message):
        for waiter in MessageWebSocketHandler.waiters:
            try:
                waiter.write_message(message)
            except Exception as e:
                print(f"Error in broadcast: {e}")


def make_app():
    return tornado.web.Application([
        (r"/", MainHandler),
        (r"/login", LoginHandler),
        (r"/logout", LogoutHandler),
        (r"/register", RegisterHandler),
        (r"/rooms", GetRoomsHandler),
        (r"/room/create", RoomHandler),
        (r"/room/add_member", RoomMemberHandler),
        (r"/room_members", RoomMembersHandler),
        (r"/messages", MessagesHandler),
        (r"/direct_messages", DirectMessagesHandler),
        (r"/users", GetUsersHandler),
        (r"/ws", MessageWebSocketHandler),
        (r"/images/(.*)", ImageHandler),  # Route for serving images
        (r"/static/(.*)", tornado.web.StaticFileHandler, {"path": "static"}),
    ],
        cookie_secret="__GENERATE_YOUR_OWN_RANDOM_VALUE_HERE__",
        template_path=os.path.join(os.path.dirname(__file__), "templates"),
        static_path=os.path.join(os.path.dirname(__file__), "static"),
        debug=True)


if __name__ == "__main__":
    # Initialize database
    init_db()

    # Create necessary directories
    os.makedirs("static", exist_ok=True)
    os.makedirs("templates", exist_ok=True)
    os.makedirs("uploads", exist_ok=True)  # Directory for uploaded images

    print("Starting server with debug mode enabled")
    print("Available users:")
    conn = sqlite3.connect('messenger.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT id, username FROM users")
    users = cursor.fetchall()
    conn.close()
    for user in users:
        print(f"  ID: '{user['id']}', Username: '{user['username']}'")

    app = make_app()
    app.listen(8888)
    print("Server started at http://localhost:8888")
    tornado.ioloop.IOLoop.current().start()