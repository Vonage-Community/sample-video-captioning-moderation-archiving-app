// State management
let session;
let applicationId;
let sessionId;
let token;
let name;
let isPresenter;
let archive = null;
let captions = null;
let captionsRemovalTimer;
let publisher;
const streams = {};
const manuallyMutedSet = new Set();

// =================================
// Login and session initialization
// =================================

/**
 * Handles the login form submission
 * Updates UI depending on whether or not user is presenter
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
        isPresenter = data.is_presenter ? "true" : "false";

        // Update the UI
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('sessionContainer').style.display = 'block';

        if (isPresenter === "true") {
            console.log(`Presenter is:  ${isPresenter}. Styling Presenter elements`)
            document.getElementById('archiveControls').style.display = 'block';
            document.getElementById('captionControls').style.display = 'block';
            document.getElementById('mutingControls').style.display = 'block';
        } else {
            document.getElementById('archiveControls').style.display = 'none';
            document.getElementById('captionControls').style.display = 'none';
            document.getElementById('mutingControls').style.display = 'none';
        }

        // Initialize the session    
        connectToSession();

    } catch (error) {
        console.error('Error initializing session:', error);
    }
}

/**
 * Initializes the Vonage Video session and attaches all session event listeners
 */
function connectToSession() {
    session = OT.initSession(applicationId, sessionId);
    console.log('Session created: ', session);

    session.connect(token, (error) => {
        if (error) {
            console.error('Error connecting:', error);
            return;
        }
        if (isPresenter === "true") {
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
            console.log(`Now publishing stream: ${publisher.stream}`);
        }
    });

    // Attach captionReceived to every new subscriber
    session.on('streamCreated', (event) => {
        const subscriber = session.subscribe(event.stream, 'subscriber');
        subscriber.on('captionReceived', handleCaptionReceived);
        const stream = event.stream;
        streams[stream.id] = { id: stream.id, name: stream.name, connectionId: stream.connection.connectionId };
        addStreamToDropdown(stream.id, stream.name);
        addStreamToRemoveDropdown(stream.id, stream.name);
        renderMuteStatusList();
    });

    // Listen for signaling events for chat
    session.on('signal', (event) => {
        const messages = document.getElementById('messages');
        messages.innerHTML += `<p>${event.data}</p>`;
    });

    // Listen for mute forced events
    session.on('muteForced', (event) => {
        console.log('Mute forced event, active:', event.active);
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

    session.on('streamDestroyed', (event) => {
        removeStreamFromDropdown(event.stream.id);
        removeFromRemoveDropdown(event.stream.id);
        renderMuteStatusList();
    });

    session.on('sessionDisconnected', (event) => {
        console.log('Disconnected from session:', event.reason);
    });

    setupListeners();
}

function setupListeners() {
    // Wire up caption buttons
    const captionsStartBtn = document.querySelector('#captionsStart');
    const captionsStopBtn = document.querySelector('#captionsStop');

    if (captionsStartBtn) captionsStartBtn.addEventListener('click', startClosedCaptioning, false);
    if (captionsStopBtn) captionsStopBtn.addEventListener('click', stopClosedCaptioning, false);


    // Close dropdown if user clicks outside
    document.addEventListener('click', (event) => {
        document.querySelectorAll('.muteWrapper').forEach((wrapper) => {
            if (!wrapper.contains(event.target)) {
                wrapper.querySelector('.muteDropdown')?.classList.remove('open');
            }
        });
    });
    // Wire up mute buttons
    const muteSpecificStreamBtn = document.querySelector('#muteSpecificStream');
    if (muteSpecificStreamBtn) muteSpecificStreamBtn.addEventListener('click', toggleDropdown, false);

    // Wire up removal buttons
    const removeParticipantBtn = document.querySelector('#removeParticipant');
    if (removeParticipantBtn) removeParticipantBtn.addEventListener('click', toggleRemoveDropdown, false);

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

// ========================
// Functions for captioning
// ========================

// Captioning functions
async function startClosedCaptioning() {
    console.log('Start live captioning');
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
    console.log('Stop live captioning');
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
// ====================
// Functions for muting
// ====================

function toggleDropdown() {
    const dropdown = document.getElementById('muteDropdown');
    dropdown.classList.toggle('open');
}

function addStreamToDropdown(streamId, streamName) {
    // Removed: if (streams[streamId]) return;

    const list = document.getElementById('streamList');
    const placeholder = list.querySelector('li em');
    if (placeholder) list.innerHTML = '';

    const li = document.createElement('li');
    li.setAttribute('data-stream-id', streamId);
    li.textContent = `Stream: ${streamName || streamId}`;
    li.onclick = () => muteSpecificStream(streamId);
    list.appendChild(li);
}

function hideStreamFromDropdown(streamId) {
    // Does NOT delete from streams — just removes the DOM element
    const list = document.getElementById('streamList');
    const li = list.querySelector(`li[data-stream-id="${streamId}"]`);
    if (li) list.removeChild(li);
    if (list.children.length === 0) {
        list.innerHTML = '<li><em>No streams available</em></li>';
    }
}

function removeStreamFromDropdown(streamId) {
    delete streams[streamId];
    hideStreamFromDropdown(streamId);
}



function renderMuteStatusList() {
    const list = document.getElementById('muteStatusList');
    list.innerHTML = '';
    Object.values(streams).forEach((stream) => {
        const isMuted = manuallyMutedSet.has(stream.id);
        const li = document.createElement('li');
        li.setAttribute('data-stream-id', stream.id);
        li.textContent = `${stream.name || stream.id} — ${isMuted ? '🔇 Muted' : '🔊 Unmuted'}`;
        list.appendChild(li);
    });
    if (list.children.length === 0) {
        list.innerHTML = '<li><em>No participants</em></li>';
    }
}

// Mute a specific stream
function muteSpecificStream(streamId) {
    document.getElementById('muteDropdown').classList.remove('open');
    fetch('/mute-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, streamId })
    })
        .then((res) => res.json())
        .then((data) => {
            console.log(data.message);
            hideStreamFromDropdown(streamId);
            manuallyMutedSet.add(streamId);
            renderMuteStatusList();
        })
        .catch((error) => console.error('Error muting stream:', error));
}

// ======================
// Functions for removing
// ======================

function toggleRemoveDropdown() {
    const dropdown = document.getElementById('removeDropdown');
    dropdown.classList.toggle('open');
}

function addStreamToRemoveDropdown(streamId, streamName) {
    const list = document.getElementById('removeStreamList');
    const placeholder = list.querySelector('li em');
    if (placeholder) list.innerHTML = '';

    const li = document.createElement('li');
    li.setAttribute('data-stream-id', streamId);
    li.textContent = `${streamName || streamId}`;
    li.onclick = () => removeParticipant(streamId);
    list.appendChild(li);
}

function removeFromRemoveDropdown(streamId) {
    const list = document.getElementById('removeStreamList');
    const li = list.querySelector(`li[data-stream-id="${streamId}"]`);
    if (li) list.removeChild(li);
    if (list.children.length === 0) {
        list.innerHTML = '<li><em>No participants</em></li>';
    }
}

function removeParticipant(streamId) {
    document.getElementById('removeDropdown').classList.remove('open');
    fetch('/remove-participant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, connection_id: streams[streamId].connectionId })
    })
        .then((res) => res.json())
        .then((data) => {
            console.log(data.message);
            // The streamDestroyed event will handle cleanup
        })
        .catch((error) => console.error('Error removing participant:', error));
}
// =======================
// Functions for archiving
// =======================

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