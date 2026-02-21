import React from 'react'

export function ListenButton(props: { disabled: boolean; onClick: () => void }): JSX.Element {
  return (
    <button className="p-btn p-btn-primary" style={{ width: '100%' }} disabled={props.disabled} onClick={props.onClick}>
      Listen to this page
    </button>
  )
}

