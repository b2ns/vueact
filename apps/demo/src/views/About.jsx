import { provide, ref } from 'vueact';
import Hello from '../components/Hello';
import './About.css';

export default () => {
  const name = ref('');
  provide('hello-name', name);

  return () => (
    <div class="about-page">
      <h3>about page</h3>
      <Hello name={name.value} />
      <p>
        <input type="text" onInput={(e) => (name.value = e.target.value)} />
      </p>
    </div>
  );
};
