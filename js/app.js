import React, { useState } from 'react';

function App() {
  const [message, setMessage] = useState('Hello, React and GitHub!');
  return <div>{message}</div>;
}

export default App;
