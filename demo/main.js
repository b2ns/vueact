import { createApp } from '../src/index.js';
import App from './App';

const app = createApp(App, { name: 'vueact' });
app.mount('#app');
console.log(app);
