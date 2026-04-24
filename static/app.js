let session = OT.initSession(applicationId, sessionId);

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

session.connect(token, (error) => {
    if (error) {
        console.error('Error connecting:', error);
        return;
    }
    if (isAdmin) {
        const publisher = OT.initPublisher('publisher');
        session.publish(publisher);
    }
});

function sendChat(event) {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    session.signal(
        { type: 'chat', data: `${name}: ${input.value}` },
        (error) => { if (!error) input.value = ''; }
    );
}