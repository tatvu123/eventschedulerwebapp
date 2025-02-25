import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { getFirestore, collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Firebase Configuration
const firebaseConfig = {
    apiKey: 'AIzaSyD-h1R0w91_b6a-5xiyEa_MV8UaQ30y6Dw',
    authDomain: 'eventschedulerwebapp.firebaseapp.com',
    projectId: 'eventschedulerwebapp',
    storageBucket: 'eventschedulerwebapp.firebasestorage.app',
    messagingSenderId: '521503456109',
    appId: '1:521503456109:web:61fa65c0a77d1b1e56b864'
};

// Global Variables
let events = [];
let currentDate = new Date();
let dbInstance;
let isAuthenticated = false;
let genAI;
let model;

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const authOverlay = document.getElementById('auth-overlay');
const appElement = document.getElementById('app');

// Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        window.location.reload();
      });
    });
  }

// IndexedDB Setup
const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('EventSchedulerDB', 2);

        request.onupgradeneeded = (event) => {
            dbInstance = event.target.result;
            if (!dbInstance.objectStoreNames.contains('pendingTasks')) {
                const store = dbInstance.createObjectStore('pendingTasks', {
                    keyPath: 'id',
                    autoIncrement: true
                });
                store.createIndex('action', 'action', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };

        request.onerror = (event) => reject(event.target.error);
    });
};

// Anonymous Authentication for testing
// document.getElementById('biometric-auth').addEventListener('click', async () => {
//     try {
//         showFeedback('Authenticating...');
//         await signInAnonymously(auth);
//         document.getElementById('auth-overlay').style.display = 'none';
//         document.getElementById('app').classList.remove('hidden');
//         loadEvents();
//         showFeedback('Authenticated successfully!');
//     } catch (error) {
//         showFeedback(`Authentication failed: ${error.message}`);
//         console.error('Auth error:', error);
//     }
// });

// Google sso
const provider = new GoogleAuthProvider();
document.getElementById('google-auth').addEventListener('click', async () => {
    try {
        showFeedback('Signing in with Google...');
        await signInWithPopup(auth, provider);
        showFeedback('Signed in successfully!');
    } catch (error) {
        showFeedback(`Sign-in failed: ${error.message}`);
        console.error('Google auth error:', error);
    }
});

// Sign out
document.getElementById('signout-btn').addEventListener('click', async () => {
    try {
        await signOut(auth);
        showFeedback('Signed out successfully!');
        document.getElementById('auth-overlay').style.display = 'block';
    } catch (error) {
        showFeedback(`Sign-out failed: ${error.message}`);
        console.error('Sign-out error:', error);
    }
});

function loadEvents() {
    const user = auth.currentUser;
    if (user) {
        const q = query(collection(db, 'events'), where('userId', '==', user.uid));
        onSnapshot(q, snapshot => {
            events = snapshot.docs.map(doc => {
                const data = doc.data();
                const time = data.time.toDate();
                return {
                    id: doc.id,
                    ...data,
                    time: time.toISOString(),
                    year: time.getFullYear(),
                    month: time.getMonth(),
                    date: time.getDate()
                };
            });
            generateCalendar();
        });
    }
}

// Calendar grid generation
function generateCalendar() {
    const calendarGrid = document.getElementById('calendar-grid');
    const existingDays = [...calendarGrid.children];
    calendarGrid.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const newElements = [];

    for (let i = 0; i < firstDay; i++) {
        newElements.push(createDayElement(''));
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const existing = existingDays.find(el =>
            el.querySelector('.day-number')?.textContent === day.toString()
        );

        const dayElement = existing || createDayElement(day);
        updateDayElement(dayElement, day, year, month);
        newElements.push(dayElement);
    }

    calendarGrid.append(...newElements);
    document.getElementById('current-month').textContent =
        `${currentDate.toLocaleString('default', { month: 'long' })} ${year}`;
}

function updateDayElement(element, day, year, month) {
    const eventsContainer = element.querySelector('.day-events');
    eventsContainer.innerHTML = '';

    const dailyEvents = events.filter(event => {
        const eventDate = new Date(event.time);
        return eventDate.getFullYear() === year &&
            eventDate.getMonth() === month &&
            eventDate.getDate() === day;
    });

    dailyEvents.forEach(event => {
        eventsContainer.appendChild(createEventCard(event));
    });
}

function createDayElement(day) {
    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day glass';
    dayElement.tabIndex = 0;
    dayElement.setAttribute('role', 'gridcell');
    dayElement.innerHTML = `
        <div class="day-number">${day}</div>
        <div class="day-events" role="list"></div>
    `;
    dayElement.style.minHeight = '150px';
    dayElement.addEventListener('keydown', handleDayKeyPress);
    return dayElement;
}

function handleDayKeyPress(e) {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal();
    }
}

function createEventCard(event) {
    const card = document.createElement('div');
    card.setAttribute('data-task-id', event.id);
    card.className = 'event-card';
    card.innerHTML = `
        <div class="event-content">
            <div class="event-title">${event.title}</div>
            <div class="event-time">${new Date(event.time).toLocaleString()}</div>
        </div>
        <div class="event-actions">
            <button class="delete-btn" onclick="deleteEvent('${event.id}')" aria-label="Delete event">
                <i class="fas fa-trash"></i>
            </button>
            <button class="edit-btn" onclick="openEditModal('${event.id}')" aria-label="Edit event">
                <i class="fas fa-edit"></i>
            </button>
        </div>
    `;
    return card;
}

// Edit Event
let editingEventId = null;

function openEditModal(eventId) {
    const event = events.find(e => e.id === eventId);
    if (!event) return;

    editingEventId = eventId;
    document.getElementById('event-title').value = event.title;
    document.getElementById('event-time').value = formatDateTimeForInput(new Date(event.time));
    document.querySelector('.action-btn.save').textContent = 'Update Event';
    openModal();
}

function formatDateTimeForInput(date) {
    const pad = num => num.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function addEvent(e) {
    if (e) e.preventDefault();
    if (!isAuthenticated) {
        showFeedback('Please authenticate first!');
        return;
    }

    const title = document.getElementById('event-title').value.trim();
    const timeInput = document.getElementById('event-time').value;

    if (!title || !timeInput) {
        showFeedback('Please fill all fields');
        return;
    }

    try {
        const user = auth.currentUser;
        const eventData = {
            title: title,
            time: Timestamp.fromDate(new Date(timeInput)),
            userId: user.uid
        };

        if (editingEventId) {
            if (navigator.onLine) {
                await updateDoc(doc(db, 'events', editingEventId), eventData);
            } else {
                await queueTask('edit', { id: editingEventId, ...eventData });
            }
            events = events.map(e => e.id === editingEventId ? {
                ...e,
                ...eventData,
                time: new Date(timeInput).toISOString()
            } : e);
        } else {
            const newEvent = {
                ...eventData,
                id: Date.now().toString()
            };

            if (navigator.onLine) {
                await setDoc(doc(db, 'events', newEvent.id), newEvent);
            } else {
                await queueTask('add', newEvent);
            }
            events = [...events, newEvent];
        }

        generateCalendar();
        showFeedback(editingEventId ? 'Event updated!' : 'Event saved!');
        closeModal();
    } catch (error) {
        showFeedback(`Error: ${error.message}`);
        console.error('Save error:', error);
    }
}

async function deleteEvent(eventId) {
    try {
        if (navigator.onLine) {
            await deleteDoc(doc(db, 'events', eventId));
        } else {
            const event = events.find(e => e.id === eventId);
            await queueTask('delete', event);
        }

        events = events.filter(e => e.id !== eventId);
        generateCalendar();
        showFeedback('Event removed successfully!');
    } catch (error) {
        showFeedback(`Error: ${error.message}`);
    }
}

// Offline queue
async function queueTask(action, data) {
    const validActions = ['add', 'delete', 'edit'];
    if (!validActions.includes(action)) return;
    const transaction = dbInstance.transaction(['pendingTasks'], 'readwrite');
    const store = transaction.objectStore('pendingTasks');
    await store.add({ action, data, timestamp: Date.now() });

    if ('SyncManager' in window) {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('pending-tasks');
    }
}


// UI Functions
function appendMessage(content, sender) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    messageDiv.innerHTML = `<div class="message-bubble">${content}</div>`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Modal management with focus trapping
let lastFocusedElement;

function openModal() {
    lastFocusedElement = document.activeElement;
    const modal = document.getElementById('event-modal');

    // Use requestAnimationFrame for better focus handling
    requestAnimationFrame(() => {
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        document.getElementById('event-title').focus();
    });

    // Use passive event listener
    modal.addEventListener('keydown', trapTabKey, { passive: true });
}

function closeModal() {
    const modal = document.getElementById('event-modal');
    const saveButton = document.getElementById('save-event');

    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');

    saveButton.textContent = 'Create Event';
    document.getElementById('event-form').reset();

    editingEventId = null;
    modal.removeEventListener('keydown', trapTabKey);

    requestAnimationFrame(() => {
        lastFocusedElement?.focus();
    });
}

function trapTabKey(e) {
    const focusable = Array.from(document.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === first) {
            last.focus();
            e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
            first.focus();
            e.preventDefault();
        }
    }
}

// Enhanced feedback system with ARIA
function showFeedback(message) {
    const feedback = document.createElement('div');
    feedback.className = 'feedback';
    feedback.setAttribute('role', 'alert');
    feedback.setAttribute('aria-live', 'polite');
    feedback.textContent = message;
    document.body.appendChild(feedback);
    setTimeout(() => feedback.remove(), 3000);
}

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // New event with Ctrl+Alt+N
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'n') {
        openModal();
    }

    // Close with esc
    if (e.key === 'Escape') {
        closeModal();
    }
});

// Make calendar grid keyboard navigable
document.getElementById('calendar-grid').setAttribute('role', 'grid');

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
    await initDB();
    await initializeAIModel();

    document.getElementById('prev-month').addEventListener('click', () => {
        currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1);
        generateCalendar();
    });

    document.getElementById('next-month').addEventListener('click', () => {
        currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1);
        generateCalendar();
    });

    document.getElementById('save-event').addEventListener('click', addEvent);
    document.getElementById('cancel-event').addEventListener('click', closeModal);

    auth.onAuthStateChanged(user => {
        isAuthenticated = !!user;
        const authOverlay = document.getElementById('auth-overlay');

        if (user) {
            authOverlay.style.display = 'none';
            document.getElementById('app').classList.remove('hidden');
            const q = query(collection(db, 'events'), where('userId', '==', user.uid));
            onSnapshot(q, snapshot => {
                events = snapshot.docs.map(doc => ({
                    ...doc.data(),
                    id: doc.id,
                    time: doc.data().time.toDate().toISOString()
                }));
                generateCalendar();
            });
        } else {
            authOverlay.style.display = 'block';
            document.getElementById('app').classList.add('hidden');
            events = [];
            generateCalendar();
        }
    });
});

// Google Generative AI
function ruleChatBot(request) {
    const normalizedRequest = request.toLowerCase().trim();

    // Add new schedule
    if (normalizedRequest.startsWith('add schedule')) {
        openModal();
        appendMessage('Please fill in the event details in the form that just opened', 'bot');
        return true;
    }

    // Delete schedule
    if (normalizedRequest.startsWith('delete schedule')) {
        const taskName = request.replace('delete schedule', '').trim();
        const event = events.find(e => e.title.toLowerCase() === taskName.toLowerCase());

        if (event) {
            deleteEvent(event.id);
            appendMessage(`Deleted event "${event.title}"`, 'bot');
        } else {
            appendMessage(`Event "${taskName}" not found`, 'bot');
        }
        return true;
    }

    // Edit schedule
    if (normalizedRequest.startsWith('edit schedule')) {
        const taskName = request.replace('edit schedule', '').trim();
        const event = events.find(e => e.title.toLowerCase() === taskName.toLowerCase());

        if (event) {
            openEditModal(event.id);
            appendMessage(`Editing event "${event.title}". Update the details in the form.`, 'bot');
        } else {
            appendMessage(`Event "${taskName}" not found`, 'bot');
        }
        return true;
    }

}

// AI API key
async function initializeAIModel() {
    try {
        const apiKeyDoc = await getDoc(doc(db, 'apikey', 'googlegenai'));
        if (!apiKeyDoc.exists()) throw new Error('API key not found');

        genAI = new GoogleGenerativeAI(apiKeyDoc.data().key);
        model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    } catch (error) {
        console.error('Please authenticate first', error);
    }
}

// Global AI handler
const aiHandler = {
    generate: async (prompt) => {
        try {
            const user = auth.currentUser;
            if (!user) {
                showFeedback('Please sign in first!');
                return 'Authentication required';
            }

            if (!model) await initializeAIModel();

            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            console.error('AI Error:', error);
            return 'Sorry, I couldn\'t process that request.';
        }
    }
};

const sanitizeInput = (text) => {
    return text.replace(/[<>]/g, '');
};

// Auth State Listener
auth.onAuthStateChanged(user => {
    const signoutBtn = document.getElementById('signout-btn');
    if (user) {
        document.getElementById('user-greeting').textContent = `Hi, ${user.displayName || 'User'}!`;
        signoutBtn.style.display = 'block';
        authOverlay.style.display = 'none';
        appElement.classList.remove('hidden');
        loadEvents();

    } else {
        document.getElementById('user-greeting').textContent = '';
        signoutBtn.style.display = 'none';
        authOverlay.style.display = 'block';
        appElement.classList.add('hidden');
        events = [];
        generateCalendar();
    }
});

// AI Chatbot
document.getElementById('send-msg').addEventListener('click', handleChatInput);
document.getElementById('chat-input').addEventListener('keypress', async (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
        const prompt = sanitizeInput(e.target.value);
        appendMessage(prompt, 'user');
        handleChatInput(e);

        try {
            if (!ruleChatBot(prompt)) {
                const response = await aiHandler.generate(prompt);
                appendMessage(response, 'bot');
            }
        } catch (error) {
            appendMessage('Sorry, there was an error processing your request', 'bot');
        }

        e.target.value = '';
    }
});

async function handleChatInput(e) {
    const input = document.getElementById('chat-input');
    const prompt = sanitizeInput(input.value.trim());
    
    if (!prompt) return;
    
    appendMessage(prompt, 'user');
    input.value = '';
    
    try {
        if (!ruleChatBot(prompt)) {
            const response = await aiHandler.generate(prompt);
            appendMessage(response, 'bot');
        }
    } catch (error) {
        appendMessage('Sorry, there was an error processing your request', 'bot');
    }
}

// Minimize chat
document.getElementById('minimize-chat').addEventListener('click', toggleChat);
let isChatMinimized = false;

function toggleChat(minimize = true) {
    const container = document.getElementById('assistant-container');
    const chat = document.getElementById('assistant-chat');
    const minimizeBtn = document.getElementById('minimize-chat');
    isChatMinimized = minimize ?? !isChatMinimized;
    container.classList.toggle('minimized', isChatMinimized);
    chat.classList.toggle('hidden', isChatMinimized);
    minimizeBtn.innerHTML = isChatMinimized ?
        '<i class="fas fa-plus"></i>' :
        '<i class="fas fa-minus"></i>';
    minimizeBtn.setAttribute('aria-label', isChatMinimized ? 'Expand chat' : 'Minimize chat');
    localStorage.setItem('chatMinimized', isChatMinimized);
    if (!isChatMinimized) {
        setTimeout(() => document.getElementById('chat-input').focus(), 100);
    }
}

// Initialize chat state
document.addEventListener('DOMContentLoaded', () => {
    // minimize chat by default
    if (!localStorage.getItem('chatInitialized')) {
        localStorage.setItem('chatMinimized', 'true');
        localStorage.setItem('chatInitialized', 'true');
    }
    document.getElementById('save-event').addEventListener('click', addEvent);
    document.getElementById('cancel-event').addEventListener('click', closeModal);
    isChatMinimized = localStorage.getItem('chatMinimized') === 'true';
    toggleChat(isChatMinimized);
});

// Event listeners
document.getElementById('minimize-chat').addEventListener('click', function (e) {
    e.stopPropagation();
    toggleChat();
});

document.getElementById('assistant-header').addEventListener('click', function (e) {
    if (!isChatMinimized) return;
    e.stopPropagation();
    toggleChat(false);
});

//Task Helper Functions
function findTaskByName(taskName) {
    return events.find(event =>
        event.title.toLowerCase().includes(taskName.toLowerCase())
    );
}

function removeVisualTask(taskId) {
    const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
    if (taskElement) {
        taskElement.remove();
    }
}

Object.assign(window, {
    addEvent,
    closeModal,
    deleteEvent,
    openEditModal,
    toggleChat
});

window.addEvent = addEvent;
window.closeModal = closeModal;
window.deleteEvent = deleteEvent;
window.openEditModal = openEditModal;
window.toggleChat = toggleChat;