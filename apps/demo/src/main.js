import { createApp } from 'vueact';
import App from './App';

const app = createApp(App, { name: 'vueact' });
app.mount('#app');
// eslint-disable-next-line
console.log(app);
