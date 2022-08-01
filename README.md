<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/b2ns/vueact/assets/logo.png">
</p>

# vueact

[![vue](https://shields.io/badge/vue-35495E?logo=vuedotjs&style=flat)](https://github.com/vuejs/core)
[![react](https://shields.io/badge/react-black?logo=react&style=flat)](https://github.com/facebook/react/)

a toy mixing Vue and React features

just for fun 🕹️

## features ✨

- Vue
  - reactivity
  - composition api
  - lifecycle hooks
  - class and style normalize
  - custom renderer
- React
  - JSX
  - stateful functional component
  - props.children (i.e., slots in Vue)
  - render props
- no dependencis
  - homemade JSX compiler (extend the React JSX)
  - homemade assets bundler 📦

## todo 🔨

- vueact

  - [ ] watchPostEffect
  - [ ] provide, inject
  - [ ] Fragment
  - [ ] quick diff algorithem when children with keys
  - [ ] v-show, v-model
  - [ ] custom directives
  - [ ] element ref
  - [ ] KeepAlive
  - [ ] Teleport (or Portal)
  - [ ] defineProps

- pack

  - [x] inject renderFactory `h` automatically
  - [ ] watch mode
  - [ ] a javascript parser(e.g., [acorn](https://github.com/acornjs/acorn)) for more analyzing on source code
  - [ ] tree-shaking
  - [ ] hmr(i.e., hot module replacement)
