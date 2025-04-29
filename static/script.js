document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const messagesContainer = document.getElementById('messages-container');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const roomsList = document.getElementById('rooms-list');
    const privateRoomsList = document.getElementById('private-rooms-list');
    const usersList = document.getElementById('users-list');
    const currentRoomName = document.getElementById('current-room-name');
    const roomMembersCount = document.getElementById('room-members-count');
    const customUsername = document.getElementById('custom-username');
    const addMemberBtn = document.getElementById('add-member-btn');
    const uploadImageBtn = document.getElementById('upload-image-btn');
    const imageInput = document.getElementById('image-input');
    const imagePreview = document.getElementById('image-preview');
    const removeImageBtn = document.getElementById('remove-image-btn');
    const mobileSidebarBtn = document.getElementById('mobile-sidebar-btn');
    const sidebar = document.querySelector('.app-sidebar');
    const sidebarTabs = document.querySelectorAll('.sidebar-tab');
    const sidebarTabContents = document.querySelectorAll('.sidebar-tab-content');

    // Modal elements
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const createRoomBtn = document.getElementById('create-room-btn');

    const loginModal = document.getElementById('login-modal');
    const registerModal = document.getElementById('register-modal');
    const createRoomModal = document.getElementById('create-room-modal');
    const addMemberModal = document.getElementById('add-member-modal');
    const imageLightbox = document.getElementById('image-lightbox');
    const lightboxImg = document.getElementById('lightbox-img');

    // Close buttons for all modals
    const closeButtons = document.querySelectorAll('.close');

    // Form elements
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const createRoomForm = document.getElementById('create-room-form');
    const addMemberForm = document.getElementById('add-member-form');

    // Error message elements
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');
    const createRoomError = document.getElementById('create-room-error');
    const addMemberError = document.getElementById('add-member-error');

    // Templates
    const roomItemTemplate = document.getElementById('room-item-template');
    const userItemTemplate = document.getElementById('user-item-template');
    const messageGroupTemplate = document.getElementById('message-group-template');
    const messageTemplate = document.getElementById('message-template');
    const dateDividerTemplate = document.getElementById('date-divider-template');
    const emptyStateTemplate = document.getElementById('empty-state-template');

    // State variables
    let currentRoomId = 'public';
    let currentDirectMessageUser = null;
    let isDirectMessage = false;
    let socket = null;
    let currentImageData = null;
    let currentMessageGroups = {};
    let lastMessageSender = null;
    let lastMessageDate = null;
    let activeUsers = new Set(); // Track active users

    // Connect to WebSocket
    function connectWebSocket() {
        // Close the existing socket if it exists
        if (socket) {
            socket.close();
        }

        // Create a new WebSocket connection
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

        socket.onopen = function() {
            console.log('WebSocket connection established');

            // Load rooms and messages once connected
            loadRooms();
            if (!isDirectMessage) {
                loadMessages(currentRoomId);
            } else if (currentDirectMessageUser) {
                loadDirectMessages(currentDirectMessageUser);
            }
        };

        socket.onmessage = function(event) {
            const data = JSON.parse(event.data);
            console.log('Received WebSocket message:', data); // Debug log

            if (data.error) {
                showTemporaryMessage(data.error);
                return;
            }

            if (data.type === 'new_message') {
                const message = data.message;

                // Only add message to the container if it's for the current room
                if (!isDirectMessage && message.room_id === currentRoomId) {
                    addMessageToContainer(message);

                    // Scroll to the bottom
                    scrollToBottom();
                }
            } else if (data.type === 'new_direct_message') {
                const message = data.message;
                console.log('New direct message received:', message); // Debug log
                console.log('Current state - isDirectMessage:', isDirectMessage);
                console.log('Current direct message user:', currentDirectMessageUser);
                console.log('Current user ID:', getUserId());

                // Check if this is the current direct message conversation
                if (isDirectMessage &&
                    ((message.sender_id === currentDirectMessageUser && message.recipient_id === getUserId()) ||
                     (message.recipient_id === currentDirectMessageUser && message.sender_id === getUserId()))) {
                    console.log('Message is for current conversation, adding to container');
                    addMessageToContainer(message);

                    // Scroll to the bottom
                    scrollToBottom();
                } else {
                    // Show notification that there's a new message
                    const otherUserId = message.sender_id === getUserId() ? message.recipient_id : message.sender_id;
                    const otherUsername = message.sender_id === getUserId() ? message.recipient_name : message.sender_name;

                    console.log('Message is not for current conversation');
                    console.log('Other user ID:', otherUserId);

                    // Add user to active set if not already there
                    activeUsers.add(otherUserId);

                    // Highlight the user in the users list
                    const userItems = usersList.querySelectorAll('.user-item');
                    userItems.forEach(item => {
                        if (item.dataset.userId === otherUserId) {
                            item.classList.add('new-message');
                        }
                    });

                    // Show temporary message
                    showTemporaryMessage(`New message from ${otherUsername}`);

                    // Play notification sound
                    playNotificationSound();
                }
            }
        };

        socket.onclose = function() {
            console.log('WebSocket connection closed');

            // Attempt to reconnect after a delay
            setTimeout(connectWebSocket, 3000);
        };

        socket.onerror = function(error) {
            console.error('WebSocket error:', error);
        };
    }

    // Helper functions
    function formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function formatDateForDivider(timestamp) {
        const date = new Date(timestamp);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
        }
    }

    function shouldAddDateDivider(timestamp) {
        if (!lastMessageDate) return true;

        const date = new Date(timestamp);
        const lastDate = new Date(lastMessageDate);

        return date.toDateString() !== lastDate.toDateString();
    }

    function getInitials(name) {
        if (!name) return '?';
        return name.split(' ').map(word => word[0]).join('').toUpperCase();
    }

    function addMessageToContainer(message) {
        console.log('Adding message to container:', message); // Debug log

        // For direct messages, we need to handle cases where sender_id or recipient_id matches the current user
        const isCurrentUser = message.sender_id === getUserId();
        const messageDate = new Date(message.created_at).toDateString();

        // Add date divider if needed
        if (shouldAddDateDivider(message.created_at)) {
            const dividerElem = dateDividerTemplate.content.cloneNode(true);
            const divider = dividerElem.querySelector('.date-divider');
            divider.textContent = formatDateForDivider(message.created_at);
            messagesContainer.appendChild(divider);
        }

        // Determine if we need a new message group
        let messageGroup;
        const senderId = message.sender_id || 'anonymous';
        const groupKey = `${messageDate}-${senderId}`;

        if (lastMessageSender !== senderId || shouldAddDateDivider(message.created_at)) {
            // Create a new message group
            const groupElem = messageGroupTemplate.content.cloneNode(true);
            messageGroup = groupElem.querySelector('.message-group');
            messageGroup.classList.add(isCurrentUser ? 'user-messages' : 'other-messages');
            messageGroup.dataset.senderId = senderId;
            messageGroup.dataset.date = messageDate;
            messagesContainer.appendChild(messageGroup);

            // Store the group reference
            currentMessageGroups[groupKey] = messageGroup;
        } else {
            // Use existing group
            messageGroup = currentMessageGroups[groupKey];
        }

        // Update last message sender and date
        lastMessageSender = senderId;
        lastMessageDate = message.created_at;

        // Create message element
        const messageElem = messageTemplate.content.cloneNode(true);
        const messageEl = messageElem.querySelector('.message');
        messageEl.classList.add(isCurrentUser ? 'user-message' : 'other-message');

        const senderEl = messageElem.querySelector('.message-sender');
        senderEl.textContent = message.sender_name || 'Anonymous';

        const timeEl = messageElem.querySelector('.message-time');
        timeEl.textContent = formatTimestamp(message.created_at);

        const contentEl = messageElem.querySelector('.message-content');
        contentEl.textContent = message.content;

        // Add image if present
        if (message.has_image && message.image_path) {
            const imageContainer = document.createElement('div');
            imageContainer.className = 'message-image';

            const img = document.createElement('img');
            img.src = `/images/${message.image_path}`;
            img.alt = 'Shared image';
            img.addEventListener('click', () => {
                openLightbox(`/images/${message.image_path}`);
            });

            imageContainer.appendChild(img);
            messageEl.appendChild(imageContainer);
        }

        // Add the message to the group
        messageGroup.appendChild(messageEl);
    }

    function showTemporaryMessage(text) {
        const messageElement = document.createElement('div');
        messageElement.className = 'system-message';
        messageElement.textContent = text;

        messagesContainer.appendChild(messageElement);

        // Scroll to the bottom
        scrollToBottom();

        // Remove the message after a delay
        setTimeout(() => {
            messageElement.remove();
        }, 5000);
    }

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function loadRooms() {
        fetch('/rooms')
            .then(response => response.json())
            .then(data => {
                roomsList.innerHTML = '';
                if (privateRoomsList) {
                    privateRoomsList.innerHTML = '';
                }

                let publicRoomsCount = 0;
                let privateRoomsCount = 0;

                data.rooms.forEach(room => {
                    const roomElem = roomItemTemplate.content.cloneNode(true);
                    const roomItem = roomElem.querySelector('.room-item');
                    roomItem.dataset.roomId = room.id;

                    if (room.id === currentRoomId) {
                        roomItem.classList.add('active');
                    }

                    const roomIcon = roomItem.querySelector('.room-icon');
                    roomIcon.textContent = getInitials(room.name);

                    const roomName = roomItem.querySelector('.room-name');
                    roomName.textContent = room.name;

                    if (room.is_private) {
                        const lockIcon = document.createElement('i');
                        lockIcon.className = 'fas fa-lock private-room-icon';
                        roomName.appendChild(lockIcon);
                    }

                    roomItem.addEventListener('click', () => {
                        // Set current room
                        currentRoomId = room.id;
                        isDirectMessage = false;
                        currentDirectMessageUser = null;

                        // Clear any image preview
                        clearImagePreview();

                        // Reset message grouping
                        resetMessageGrouping();

                        // Update UI
                        document.querySelectorAll('.room-item').forEach(item => {
                            item.classList.remove('active');
                        });
                        roomItem.classList.add('active');

                        document.querySelectorAll('.user-item').forEach(item => {
                            item.classList.remove('active');
                        });

                        currentRoomName.textContent = room.name;
                        updateRoomMembersCount(room);

                        // Show/hide add member button based on whether room is private
                        if (room.is_private && getUserId()) {
                            addMemberBtn.classList.remove('hidden');
                        } else {
                            addMemberBtn.classList.add('hidden');
                        }

                        // Load messages for the room
                        loadMessages(room.id);

                        // Close sidebar on mobile
                        closeSidebarOnMobile();
                    });

                    // Add to appropriate list
                    if (room.is_private && privateRoomsList) {
                        privateRoomsList.appendChild(roomItem);
                        privateRoomsCount++;
                    } else {
                        roomsList.appendChild(roomItem);
                        publicRoomsCount++;
                    }
                });

                // Show empty state if no rooms
                if (publicRoomsCount === 0) {
                    const emptyState = createEmptyState(
                        'No public rooms',
                        'Create a new room to start chatting'
                    );
                    roomsList.appendChild(emptyState);
                }

                if (privateRoomsList && privateRoomsCount === 0) {
                    const emptyState = createEmptyState(
                        'No private rooms',
                        'Create a private room to chat securely'
                    );
                    privateRoomsList.appendChild(emptyState);
                }

                // Also load users if logged in
                if (getUserId()) {
                    loadUsers();
                }
            })
            .catch(error => {
                console.error('Error loading rooms:', error);
            });
    }

    // Setup user click handler for direct messaging
    function setupUserClickHandler(userItem, user) {
        userItem.addEventListener('click', () => {
            // Set current direct message user
            currentDirectMessageUser = user.id;
            isDirectMessage = true;
            currentRoomId = null;

            console.log('Setting up direct message with user:', user.id); // Debug

            // Clear any image preview
            clearImagePreview();

            // Reset message grouping
            resetMessageGrouping();

            // Update UI
            document.querySelectorAll('.user-item').forEach(item => {
                item.classList.remove('active');
            });
            userItem.classList.add('active');

            document.querySelectorAll('.room-item').forEach(item => {
                item.classList.remove('active');
            });

            currentRoomName.textContent = `Chat with ${user.username}`;
            roomMembersCount.textContent = 'Direct Message';

            // Hide add member button
            addMemberBtn.classList.add('hidden');

            // Remove new message indicator
            userItem.classList.remove('new-message');

            // Load direct messages
            loadDirectMessages(user.id);

            // Close sidebar on mobile
            closeSidebarOnMobile();
        });
    }

    function loadUsers() {
        fetch('/users')
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.error('Error loading users:', data.error);
                    return;
                }

                usersList.innerHTML = '';
                let usersCount = 0;

                data.users.forEach(user => {
                    // Skip current user
                    if (user.id === getUserId()) {
                        return;
                    }

                    const userElem = userItemTemplate.content.cloneNode(true);
                    const userItem = userElem.querySelector('.user-item');
                    userItem.dataset.userId = user.id;

                    const userAvatar = userItem.querySelector('.user-avatar');
                    userAvatar.textContent = getInitials(user.username);

                    const userName = userItem.querySelector('.user-name');
                    userName.textContent = user.username;

                    // Add active class if this user has sent us messages
                    if (activeUsers.has(user.id)) {
                        userItem.classList.add('new-message');
                    }

                    // Set up click handler with better state management
                    setupUserClickHandler(userItem, user);

                    usersList.appendChild(userItem);
                    usersCount++;
                });

                // Show empty state if no users
                if (usersCount === 0) {
                    const emptyState = createEmptyState(
                        'No users',
                        'Invite others to join the chat'
                    );
                    usersList.appendChild(emptyState);
                }
            })
            .catch(error => {
                console.error('Error loading users:', error);
            });
    }

    function loadMessages(roomId) {
        messagesContainer.innerHTML = '';

        // Reset message grouping
        resetMessageGrouping();

        fetch(`/messages?room_id=${roomId}`)
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    showTemporaryMessage(data.error);
                    return;
                }

                if (!data.messages || data.messages.length === 0) {
                    const emptyState = createEmptyState(
                        'No messages yet',
                        'Be the first to send a message!'
                    );
                    messagesContainer.appendChild(emptyState);
                    return;
                }

                data.messages.forEach(message => {
                    addMessageToContainer(message);
                });

                // Scroll to the bottom
                scrollToBottom();
            })
            .catch(error => {
                console.error('Error loading messages:', error);
            });
    }

    function loadDirectMessages(userId) {
        messagesContainer.innerHTML = '';

        // Reset message grouping
        resetMessageGrouping();

        // Debug
        console.log(`Loading direct messages for user ID: ${userId}`);

        fetch(`/direct_messages?user_id=${userId}`)
            .then(response => response.json())
            .then(data => {
                console.log('Direct messages API response:', data); // Debug log

                if (data.error) {
                    showTemporaryMessage(data.error);
                    return;
                }

                if (!data.messages || data.messages.length === 0) {
                    const emptyState = createEmptyState(
                        'No messages yet',
                        'Start a conversation!'
                    );
                    messagesContainer.appendChild(emptyState);
                    return;
                }

                data.messages.forEach(message => {
                    console.log('Adding message from API:', message); // Debug log
                    addMessageToContainer(message);
                });

                // Scroll to the bottom
                scrollToBottom();
            })
            .catch(error => {
                console.error('Error loading direct messages:', error);
                showTemporaryMessage('Error loading direct messages. Please try again.');
            });
    }

    function createEmptyState(title, description) {
        const emptyStateElem = emptyStateTemplate.content.cloneNode(true);
        const titleEl = emptyStateElem.querySelector('.empty-state-title');
        const descriptionEl = emptyStateElem.querySelector('.empty-state-description');

        titleEl.textContent = title;
        descriptionEl.textContent = description;

        return emptyStateElem;
    }

    function sendMessage() {
        const content = messageInput.value.trim();

        // Don't send if there's no content and no image
        if (!content && !currentImageData) {
            return;
        }

        if (isDirectMessage && currentDirectMessageUser) {
            // Debug
            console.log(`Sending direct message to user ID: ${currentDirectMessageUser}`);
            console.log(`Message content: ${content}`);

            // Send direct message
            const message = {
                type: 'direct_message',
                content: content,
                recipient_id: currentDirectMessageUser
            };

            // Add image if available
            if (currentImageData) {
                message.image = currentImageData;
            }

            console.log('Sending WebSocket message:', message); // Debug log
            socket.send(JSON.stringify(message));
        } else {
            // Send regular message
            const message = {
                type: 'chat',
                content: content,
                room_id: currentRoomId
            };

            // Add image if available
            if (currentImageData) {
                message.image = currentImageData;
            }

            // Add custom username for anonymous users
            if (!getUserId() && customUsername.value.trim()) {
                message.custom_username = customUsername.value.trim();
            }

            socket.send(JSON.stringify(message));
        }

        // Clear input and image preview
        messageInput.value = '';
        clearImagePreview();

        // Auto-resize textarea
        autoResizeTextarea();
    }

    // Function to handle image selection
    function handleImageSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Check if file is an image
        if (!file.type.startsWith('image/')) {
            showTemporaryMessage('Please select an image file');
            return;
        }

        // Check file size (limit to 2MB)
        if (file.size > 2 * 1024 * 1024) {
            showTemporaryMessage('Image size should be less than 2MB');
            return;
        }

        // Read the file and create a preview
        const reader = new FileReader();
        reader.onload = function(e) {
            // Store the image data
            currentImageData = e.target.result;

            // Show preview
            imagePreview.innerHTML = `<img src="${currentImageData}" alt="Selected Image">`;
            imagePreview.classList.remove('hidden');
            removeImageBtn.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }

    // Function to clear image preview
    function clearImagePreview() {
        currentImageData = null;
        imagePreview.innerHTML = '';
        imagePreview.classList.add('hidden');
        removeImageBtn.classList.add('hidden');
        imageInput.value = ''; // Clear the file input
    }

    // Function to open lightbox
    function openLightbox(imageSrc) {
        lightboxImg.src = imageSrc;
        imageLightbox.classList.add('active');
    }

    // Function to close lightbox
    function closeLightbox() {
        imageLightbox.classList.remove('active');
    }

    // Function to toggle sidebar on mobile
    function toggleSidebar() {
        sidebar.classList.toggle('active');
    }

    // Function to close sidebar on mobile after selecting a room/user
    function closeSidebarOnMobile() {
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('active');
        }
    }

    // Function to reset message grouping
    function resetMessageGrouping() {
        currentMessageGroups = {};
        lastMessageSender = null;
        lastMessageDate = null;
    }

    // Function to update room members count
    function updateRoomMembersCount(room) {
        if (room.is_private) {
            // Fetch room members count
            fetch(`/room_members?room_id=${room.id}`)
                .then(response => response.json())
                .then(data => {
                    if (data.members) {
                        const count = data.members.length;
                        roomMembersCount.textContent = `${count} ${count === 1 ? 'member' : 'members'}`;
                    }
                })
                .catch(error => {
                    console.error('Error loading room members:', error);
                });
        } else {
            roomMembersCount.textContent = 'Public Room';
        }
    }

    // Function to auto-resize textarea
    function autoResizeTextarea() {
        messageInput.style.height = 'auto';
        messageInput.style.height = (messageInput.scrollHeight) + 'px';
    }

    // Function to scroll messages container to bottom
    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Function to play notification sound
    function playNotificationSound() {
        const sound = new Audio('data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAAFAAAGhgCAgICAgICAgICAgMDAwMDAwMDAwMDAwPDw8PDw8PDw8PDw8P////////8AAAA5TEFNRTMuMTAwA8MAAAAAAAAAABSAJAJAQgAAgAAAAoaDesbWAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxNIAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV');
        sound.play();
    }

    // Helper function to get user ID from cookie
    function getUserId() {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.startsWith('user_id=')) {
                return cookie.substring('user_id='.length, cookie.length);
            }
        }
        return null;
    }

    // Event listeners
    sendBtn.addEventListener('click', sendMessage);

    messageInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    messageInput.addEventListener('input', autoResizeTextarea);

    // Image upload event listeners
    if (uploadImageBtn) {
        uploadImageBtn.addEventListener('click', function() {
            imageInput.click();
        });
    }

    if (imageInput) {
        imageInput.addEventListener('change', handleImageSelect);
    }

    if (removeImageBtn) {
        removeImageBtn.addEventListener('click', clearImagePreview);
    }

    // Lightbox event listeners
    document.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    imageLightbox.addEventListener('click', function(event) {
        if (event.target === imageLightbox) {
            closeLightbox();
        }
    });

    // Sidebar tabs event listeners
    sidebarTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;

            // Update active tab
            sidebarTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            // Update active tab content
            sidebarTabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${tabName}-tab`) {
                    content.classList.add('active');
                }
            });
        });
    });

    // Mobile sidebar toggle
    if (mobileSidebarBtn) {
        mobileSidebarBtn.addEventListener('click', toggleSidebar);
    }

    // Modal event listeners
    if (loginBtn) {
        loginBtn.addEventListener('click', function() {
            loginModal.classList.add('active');
        });
    }

    if (registerBtn) {
        registerBtn.addEventListener('click', function() {
            registerModal.classList.add('active');
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            fetch('/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Reload the page
                    window.location.reload();
                }
            })
            .catch(error => {
                console.error('Error logging out:', error);
            });
        });
    }

    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', function() {
            createRoomModal.classList.add('active');
        });
    }

    if (addMemberBtn) {
        addMemberBtn.addEventListener('click', function() {
            addMemberModal.classList.add('active');
        });
    }

    // Close modal when clicking the close button or outside the modal
    closeButtons.forEach(button => {
        button.addEventListener('click', function() {
            const modal = this.closest('.modal-backdrop');
            if (modal) {
                modal.classList.remove('active');
            }
        });
    });

    // Form submissions
    loginForm.addEventListener('submit', function(event) {
        event.preventDefault();

        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Reload the page
                window.location.reload();
            } else {
                loginError.textContent = data.error;
            }
        })
        .catch(error => {
            console.error('Error logging in:', error);
            loginError.textContent = 'An error occurred while logging in.';
        });
    });

    registerForm.addEventListener('submit', function(event) {
        event.preventDefault();

        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (password !== confirmPassword) {
            registerError.textContent = 'Passwords do not match.';
            return;
        }

        fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Reload the page
                window.location.reload();
            } else {
                registerError.textContent = data.error;
            }
        })
        .catch(error => {
            console.error('Error registering:', error);
            registerError.textContent = 'An error occurred while registering.';
        });
    });

    createRoomForm.addEventListener('submit', function(event) {
        event.preventDefault();

        const roomName = document.getElementById('room-name').value;
        const isPrivate = document.getElementById('is-private').checked;

        fetch('/room/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `name=${encodeURIComponent(roomName)}&is_private=${isPrivate}`
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Close the modal
                createRoomModal.classList.remove('active');

                // Reset form
                createRoomForm.reset();
                createRoomError.textContent = '';

                // Reload rooms
                loadRooms();

                // Switch to the new room
                currentRoomId = data.id;
                isDirectMessage = false;
                currentDirectMessageUser = null;
                currentRoomName.textContent = data.name;

                // Reset message grouping
                resetMessageGrouping();

                // Show/hide add member button
                if (isPrivate) {
                    addMemberBtn.classList.remove('hidden');
                } else {
                    addMemberBtn.classList.add('hidden');
                }

                // Update room members count
                roomMembersCount.textContent = isPrivate ? '1 member' : 'Public Room';

                // Load messages for the room
                loadMessages(data.id);
            } else {
                createRoomError.textContent = data.error;
            }
        })
        .catch(error => {
            console.error('Error creating room:', error);
            createRoomError.textContent = 'An error occurred while creating the room.';
        });
    });

    addMemberForm.addEventListener('submit', function(event) {
        event.preventDefault();

        const username = document.getElementById('member-username').value;

        fetch('/room/add_member', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `room_id=${encodeURIComponent(currentRoomId)}&username=${encodeURIComponent(username)}`
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Close the modal
                addMemberModal.classList.remove('active');

                // Reset form
                addMemberForm.reset();
                addMemberError.textContent = '';

                // Show success message
                showTemporaryMessage(`${username} has been added to the room`);

                // Update room members count
                updateRoomMembersCount({id: currentRoomId, is_private: true});
            } else {
                addMemberError.textContent = data.error;
            }
        })
        .catch(error => {
            console.error('Error adding member:', error);
            addMemberError.textContent = 'An error occurred while adding the member.';
        });
    });

    // Initialize the application
    connectWebSocket();

    // Set initial textarea height
    autoResizeTextarea();
});