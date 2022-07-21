export default (props) => {
  return (h) => (
    <div class="hello-box">
      <p>
        hello: <i class="hello-name">{props.name}</i>
      </p>
    </div>
  );
};
