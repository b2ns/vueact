import { h, inject } from 'vueact';
import { ROUTER_VIEW_KEY } from './constants';

export default function RouterViewer(props) {
  const currentRoute = inject(ROUTER_VIEW_KEY);

  const component = null;
  return () => {
    console.log(props, currentRoute);
    return h(component);
  };
}
