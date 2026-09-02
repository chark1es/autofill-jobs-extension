import { render } from 'preact'
import { App } from '../ui/App'
import '@fontsource/source-sans-3/400.css'
import '@fontsource/source-sans-3/600.css'
import '@fontsource/source-sans-3/700.css'
import '../ui/styles.css'

document.body.classList.add('popup')
render(<App mode="popup" />, document.getElementById('root')!)
