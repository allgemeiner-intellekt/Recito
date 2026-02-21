import React from 'react'

export function PlayButton(props: { onClick: () => void }): JSX.Element {
  return (
    <button onClick={props.onClick} style={{ cursor: 'pointer' }} aria-label="Listen">
      Listen
    </button>
  )
}

