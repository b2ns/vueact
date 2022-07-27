import Main from './views/Main';
import About from './views/About';
import './App.css';

export default function App(props) {
  const footer = `<i>&copy; Copyright All Rights Reserved. ${new Date().getFullYear()}</i>`;

  return () => (
    <div class="app-box">
      <header>
        <h1>{props.name}</h1>
      </header>
      <main class="app-main">
        <Main />
        <hr />
        <About />
      </main>
      <footer class="app-footer" innerHTML={footer}></footer>
    </div>
  );
}
