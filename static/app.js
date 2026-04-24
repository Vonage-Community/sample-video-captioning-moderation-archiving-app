let session = OT.initSession(applicationId, sessionId);


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

function sendChat(event) {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    session.signal(
        { type: 'chat', data: `${name}: ${input.value}` },
        (error) => { if (!error) input.value = ''; }
    );
}

session.on('signal', (event) => {
    const messages = document.getElementById('messages');
    messages.innerHTML += `<p>${event.data}</p>`;
});

