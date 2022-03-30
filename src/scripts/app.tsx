import React, { type ReactElement } from 'react';

//! FIXME HACK CRAP GET RID OF IT!
let u = new URLSearchParams(globalThis.location.search);
const isDevMode = null !== u.get('dev');

export default function App(): ReactElement {
  return (
    <div>
      <h1>Hello World</h1>
      This is a new project!
    </div>
  );
}
