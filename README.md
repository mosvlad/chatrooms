# Chatrooms

A real-time messaging application built with Tornado, SQLite, and WebSockets. Tornado Chat features a modern UI, secure user authentication, public and private rooms, direct messaging, and image sharing capabilities.

![Tornado Chat Screenshot](screenshot.png)

## Features

- **User Authentication** - Secure registration and login system
- **Public Chat Rooms** - Open channels for group conversations
- **Private Rooms** - Invite-only spaces with member management
- **Direct Messaging** - Private conversations between users
- **Real-time Updates** - Instant message delivery using WebSockets
- **Image Sharing** - Upload and share images in conversations
- **Modern UI/UX** - Clean, responsive design with intuitive interactions
- **Message Grouping** - Messages organized by sender and date
- **Notifications** - Visual and audio alerts for new messages

## Technologies

- **Backend:**
  - Python 3.x
  - Tornado Web Server
  - SQLite Database
  - WebSockets

- **Frontend:**
  - HTML5
  - CSS3 with CSS Variables
  - JavaScript (ES6+)
  - Font Awesome icons

## Installation

### Prerequisites

- Python 3.7 or higher
- pip (Python package manager)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/mosvlad/chatrooms
   cd chatrooms
   ```

2. Install dependencies:
   ```bash
   pip install tornado
   ```

3. Start the server:
   ```bash
   python app.py
   ```

4. Access the application in your browser:
   ```
   http://localhost:8888
   ```

## Usage

### User Registration and Login

1. Click "Register" to create a new account
2. Enter username and password
3. Or click "Login" if you already have an account

### Public Chat

1. The main "Public" room is available to all users
2. Type in the message box and press Enter or click the send button
3. All users in the room will see your messages in real-time

### Creating Rooms

1. Click "Create Room" in the sidebar
2. Enter a room name
3. Select "Private Room" if you want to restrict access
4. Click "Create"

### Direct Messaging

1. Select a user from the "Direct Messages" tab in the sidebar
2. Begin typing to start a private conversation
3. Messages are only visible to you and the recipient

### Sharing Images

1. Click the image icon in the message input area
2. Select an image file (max size: 2MB)
3. Add optional message text
4. Click send to share the image
5. Click on any shared image to view it in full size

### Adding Members to Private Rooms

1. Enter a private room you've created
2. Click "Add Member" in the top right
3. Enter the username of the user you want to add
4. Click "Add"

## Project Structure

```
tornado-chat/
├── app.py                 # Main application file (server)
├── static/                # Static files directory
│   ├── style.css          # CSS styles
│   ├── script.js          # Client-side JavaScript
│   └── ...                # Other static assets
├── templates/             # HTML templates
│   └── index.html         # Main HTML template
├── uploads/               # Directory for uploaded images
├── messenger.db           # SQLite database file
└── README.md              # This documentation
```

## Database Schema

The application uses SQLite with the following tables:

- **users** - Stores user account information
- **rooms** - Stores information about chat rooms
- **messages** - Stores all messages (both room messages and direct messages)
- **room_members** - Maps users to private rooms they belong to

## Advanced Features

### Secure Cookie Authentication

User authentication is managed through Tornado's secure cookies, which provide encrypted session tracking between requests.

### Message Grouping

Messages are automatically grouped by sender and date, creating a more readable conversation flow similar to modern messaging applications.

### Real-time Typing Indicators

(If implemented) Users can see when someone is typing in real-time for both room conversations and direct messages.

### Offline Support

Messages are stored in the database, allowing users to view past conversations even if they were offline when the messages were sent.


## Security Considerations

- All passwords are hashed before storage using SHA-256
- Private rooms require explicit invitation from the room creator
- Direct messages are only visible to the sender and recipient
- WebSocket connections are verified against user sessions


## License

This project is licensed under the MIT License - see the LICENSE file for details.
