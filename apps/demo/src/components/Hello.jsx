import { inject } from 'vueact';
import './Hello.css';

export default (props) => {
  const helloName = inject('hello-name');

  return () => (
    <div class="hello-box">
      <p>injected: {helloName.value}</p>
      <p>
        hello: <i class="hello-name">{props.name}</i>
      </p>
    </div>
  );
};
