import { render, screen } from '@testing-library/react'
import App from './App'

describe('App placeholder', () => {
  it('renders a heading and a button', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /graphing calculator/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /it works/i })).toBeInTheDocument()
  })
})
