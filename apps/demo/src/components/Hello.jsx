export default (props) => () =>
  (
    <div class="hello-box">
      <p>
        hello: <i class="hello-name">{props.name}</i>
      </p>
    </div>
  );
