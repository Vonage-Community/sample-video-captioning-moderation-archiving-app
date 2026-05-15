// State management
let session;
let applicationId;
let sessionId;
let token;
let name;
let isAdmin;
let archive = null;
let captions = null;
let captionsRemovalTimer;
let publisher;

// =================================
// Login and session initialization
// =================================

/**
 * Handles the login form submission
 * Updates UI depending on whether or not user is admin
 * Initializes video connection
 */
async function handleLogin(event) {
    event.preventDefault();

    const formData = new FormData(document.getElementById('loginForm'));

    try {
        const response = await fetch('/api/generate-session', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!data.success) {
            console.error('Failed to generate session');
            return;
        }

        applicationId = data.application_id;
        sessionId = data.session_id;
        token = data.token;
        name = data.name;
        isAdmin = data.is_admin ? "true" : "false";

        // Update the UI
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('sessionContainer').style.display = 'block';

        if (isAdmin === "true") {
            console.log(`Admin is:  ${isAdmin}. Styling Admin elements`)
            document.getElementById('archiveControls').style.display = 'block';
            document.getElementById('captionControls').style.display = 'block';
        } else {
            document.getElementById('archiveControls').style.display = 'none';
            document.getElementById('captionControls').style.display = 'none';
        }

        // Initialize the session    
        connectToSession();

    } catch (error) {
        console.error('Error initializing session:', error);
    }
}

/**
 * Handles the login form submission
 * Displays certain elements depending on whether or not user is admin
 * Initializes video connection
 */
function connectToSession() {
    session = OT.initSession(applicationId, sessionId);
    console.log('Session created: ', session);

    session.connect(token, (error) => {
        if (error) {
            console.error('Error connecting:', error);
            return;
        }
        if (isAdmin === "true") {
            const publisherOptions = {
                name: name,
                publishCaptions: true,
            };
            publisher = OT.initPublisher('publisher', publisherOptions);
            session.publish(publisher, () => {
                // Subscribe to own stream to receive own captions
                const captionOnlySub = session.subscribe(
                    publisher.stream,
                    document.createElement('div'),
                    { audioVolume: 0 }
                );
                captionOnlySub.on('captionReceived', handleCaptionReceived);
            });
            console.log('Now publishing stream');
        }
    });

    // Attach captionReceived to every new subscriber
    session.on('streamCreated', (event) => {
        const subscriber = session.subscribe(event.stream, 'subscriber');
        subscriber.on('captionReceived', handleCaptionReceived);
    });

    // Listen for signaling events for chat
    session.on('signal', (event) => {
        const messages = document.getElementById('messages');
        messages.innerHTML += `<p>${event.data}</p>`;
    });

    session.on('sessionDisconnected', (event) => {
        console.log('Disconnected from session:', event.reason);
    });

    // Archiving events
    session.on('archiveStarted', (event) => {
        archive = event;
        console.log('Archive started: ' + archive.id);
        document.querySelector('#archiveStart').style.display = 'none';
        document.querySelector('#archiveStop').style.display = 'inline';
        document.querySelector('#archiveLink').innerHTML = '';
    });

    session.on('archiveStopped', (event) => {
        archive = event;
        console.log('Archive stopped: ' + archive.id);
        document.querySelector('#archiveStart').style.display = 'inline';
        document.querySelector('#archiveStop').style.display = 'none';
        document.querySelector('#archiveLink').innerHTML = 'Recording processing ...';

        pollArchiveStatus();

    });

    setupListeners();
}

function setupListeners() {
    // Wire up caption buttons
    const captionsStartBtn = document.querySelector('#captionsStart');
    const captionsStopBtn = document.querySelector('#captionsStop');

    if (captionsStartBtn) captionsStartBtn.addEventListener('click', startClosedCaptioning, false);
    if (captionsStopBtn) captionsStopBtn.addEventListener('click', stopClosedCaptioning, false);

    // Wire up archive buttons
    const archiveStartBtn = document.querySelector('#archiveStart');
    const archiveStopBtn = document.querySelector('#archiveStop');

    if (archiveStartBtn) archiveStartBtn.addEventListener('click', startArchiving, false);
    if (archiveStopBtn) archiveStopBtn.addEventListener('click', stopArchiving, false);
}

function sendChat(event) {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    session.signal(
        { type: 'chat', data: `${name}: ${input.value}` },
        (error) => { if (!error) input.value = ''; }
    );
}

// ======================================
// Functions for captioning and archiving
// ======================================

// Captioning functions
async function startClosedCaptioning() {
    console.log('Start closed captioning');
    try {
        const response = await fetch('/captions/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, token })
        });
        captions = await response.json();
        console.log('Closed captioning started: ', captions.caption_id);
        if (captions.caption_id === undefined) {
            console.error('Error starting closed captioning:', captions.error);
        } else {
            document.querySelector('#captionsStart').style.display = 'none';
            document.querySelector('#captionsStop').style.display = 'inline';
            const captionsBox = document.getElementById('captionsBox');
            const captionsText = document.getElementById('captionsText');
            captionsBox.style.display = 'flex';
            captionsText.textContent = 'Captions loading ...';
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function stopClosedCaptioning() {
    console.log('Stop closed captioning');
    try {
        const response = await fetch(`/captions/${captions.caption_id}/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
            throw new Error('Error stopping captions');
        }
        captions = null;
        const captionsBox = document.getElementById('captionsBox');
        const captionsText = document.getElementById('captionsText');
        captionsBox.style.display = 'none';
        captionsText.textContent = '';
        document.querySelector('#captionsStop').style.display = 'none';
        document.querySelector('#captionsStart').style.display = 'inline';
    } catch (error) {
        console.error('Error stopping captions:', error);
    }
}

// Handle captions
function handleCaptionReceived(event) {
    console.log('captionReceived event: ', event);
    const captionsBox = document.getElementById('captionsBox');
    const captionsText = document.getElementById('captionsText');
    const captionsStartBtn = document.querySelector('#captionsStart');
    const captionsStopBtn = document.querySelector('#captionsStop');

    if (!captions) {
        // If client didn't initiate the captions, remove controls
        if (captionsStartBtn) captionsStartBtn.style.display = 'none';
        if (captionsStopBtn) captionsStopBtn.style.display = 'none';
    }
    captionsBox.style.display = 'flex';
    captionsText.textContent = event.caption;

    // Remove captions after 5 seconds
    const removalTimerDuration = 5 * 1000;
    clearTimeout(captionsRemovalTimer);
    captionsRemovalTimer = setTimeout(() => {
        captionsBox.style.display = 'none';
        captionsText.textContent = '';
    }, removalTimerDuration);
}

// Archiving functions
async function startArchiving() {
    console.log('Start archiving');
    
    try {
        const response = await fetch('/archive/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
        });
        archive = await response.json();
        if (archive.status !== 'started') {
            console.error('Error starting archive:', archive.error);
        } else {
            console.log('Successfully started archiving: ', archive.archive_id);
            document.querySelector('#archiveStart').style.display = 'none'; 
            document.querySelector('#archiveStop').style.display = 'inline';
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function stopArchiving() {
    console.log('Stop archiving');
    const archiveId = archive.archive_id;
    try {
        const response = await fetch(`/archive/${archiveId}/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        archive = await response.json();
        if (archive.status !== 'stopped') {
            console.error('Error stopping archive:', archive.error);
        } else {
            console.log('Successfully stopped archiving: ', archiveId);
            document.querySelector('#archiveStop').style.display = 'none';
            document.querySelector('#archiveStart').style.display = 'inline';
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

/**
 * Poll the /status endpoint until the status is `available`
 * then update UI with link to archived video
 */
function pollArchiveStatus() {
    const archiveId = archive.id;
    const statusUrl = `/archive/${archiveId}/status`;
    const intervalId = setInterval(async () => {

        try {
            console.log('Waiting for archive to be available for: ', archiveId);
            const res = await fetch(statusUrl);
            const data = await res.json();

            if (data.status === 'available' || data.status === 'uploaded') {
                clearInterval(intervalId);
                const viewUrl = data.url ? data.url : `/archive/${archiveId}/view`;
                document.querySelector('#archiveLink').innerHTML = `<a href="${viewUrl}" target="_blank">View recorded video</a>`;
            }
        } catch (e) {
            console.error('Error checking archive status', e);
        }
    }, 5000); // Poll every 5 seconds    
}