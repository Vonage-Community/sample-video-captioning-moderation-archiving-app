let session;
let applicationId;
let sessionId;
let token;
let name;
let isAdmin;
let archive = null;

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

        // Store the API response data
        applicationId = data.application_id;
        sessionId = data.session_id;
        token = data.token;
        name = data.name;
        isAdmin = data.is_admin ? "true" : "false";

        // Hide login, show session
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('sessionContainer').style.display = 'block';

        // Only show archive controls to admins
        if (isAdmin === "true") {
            document.getElementById('archiveControls').style.display = 'block';
        }

        // Initialize the session with the fetched data
        connectToSession();

    } catch (error) {
        console.error('Error initializing session:', error);
    }
}

function connectToSession() {
    session = OT.initSession(applicationId, sessionId);

    console.log('Session created: ', session)

    session.connect(token, (error) => {
        if (error) {
            console.error('Error connecting:', error);
            return;
        }
        if (isAdmin === "true") {
            const publisher = OT.initPublisher('publisher', { name: name });
            session.publish(publisher);
            console.log('Now publishing stream')
        }
    });

    session.on('streamCreated', (event) => {
        session.subscribe(event.stream, 'subscriber');
    });

    session.on('sessionDisconnected', (event) => {
        console.log('Disconnected from session:', event.reason);
    });

    session.on('signal', (event) => {
        const messages = document.getElementById('messages');
        messages.innerHTML += `<p>${event.data}</p>`;
    });

    // Archive SDK events
    session.on('archiveStarted', (event) => {
        archive = event;
        console.log('Archive started: ' + archive.id);
        document.querySelector('#start').style.display = 'none';
        document.querySelector('#stop').style.display = 'inline';
        document.querySelector('#archiveLink').innerHTML = '';
    });

    session.on('archiveStopped', (event) => {
        archive = event;
        console.log('Archive stopped: ' + archive.id);
        document.querySelector('#start').style.display = 'inline';
        document.querySelector('#stop').style.display = 'none';
        document.querySelector('#archiveLink').innerHTML =
            `<a href="/archive/${archive.id}" target="_blank">View Archive</a>`;
    });

    // Wire up archive buttons
    const archiveStartBtn = document.querySelector('#start');
    const archiveStopBtn = document.querySelector('#stop');

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

async function startArchiving() {
    console.log('start archiving');
    try {
        const response = await fetch('/archive/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
        });
        archive = await response.json();
        console.log('archive started: ', archive);
        if (archive.status !== 'started') {
            console.error('Error starting archive:', archive.error);
        } else {
            console.log('successfully started archiving: ', archive);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function stopArchiving() {
    console.log('stop archiving');
    try {
        const response = await fetch(`/archive/${archive.archive_id}/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        archive = await response.json();
        console.log('archive stopped: ', archive);
        if (archive.status !== 'stopped') {
            console.error('Error stopping archive:', archive.error);
        } else {
            console.log('successfully stopped archiving: ', archive);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}


