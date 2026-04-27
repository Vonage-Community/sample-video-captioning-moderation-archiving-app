let session;
let applicationId;
let sessionId;
let token;
let name;
let isAdmin;

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

        // Initialize the session with the fetched data
        connectToSession();

    } catch (error) {
        console.error('Error initializing session:', error);
    }
}

function connectToSession() {
    session = OT.initSession(applicationId, sessionId);

    session.connect(token, (error) => {
        if (error) {
            console.error('Error connecting:', error);
            return;
        }
        if (isAdmin === "true") {
            const publisher = OT.initPublisher('publisher', { name: name });
            session.publish(publisher);
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
}

function sendChat(event) {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    session.signal(
        { type: 'chat', data: `${name}: ${input.value}` },
        (error) => { if (!error) input.value = ''; }
    );
}
