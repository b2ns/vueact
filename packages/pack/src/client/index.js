class PackClient {
  constructor() {
    this.ws = new WebSocket(process.env.SOCKET_ORIGIN, 'pack-hmr');
    this.opened = false;

    this.init();
  }

  static createClient() {
    return new this();
  }

  start() {}

  init() {
    this.ws.addEventListener(
      'open',
      () => {
        this.opened = true;
        console.log(`[ws]: connected`);
      },
      { once: true }
    );

    this.ws.addEventListener('error', (err) => {
      console.error(err);
    });

    this.ws.addEventListener('close', () => {
      console.log(`[ws]: disconneted`);
    });

    this.ws.addEventListener('message', ({ data }) => {
      this.handleMessage(JSON.parse(data));
    });
  }

  send(payload) {
    this.ws.send(JSON.stringify(payload));
  }

  close(...args) {
    this.ws.close(...args);
  }

  handleMessage(payload) {
    switch (payload.type) {
      case 'connected':
        break;
      case 'update':
        break;
      case 'reload':
        location.reload();
        break;
      case 'error':
        break;
      default:
        break;
    }
  }
}

// start the WebSocket client
PackClient.createClient().start();
