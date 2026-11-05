// Library: full-tab workspace (projects, clips, highlights, books, editor). Owner: agent U1.
import { render } from 'preact';
import '@/src/ui/base.css';
import { UiProvider } from '@/src/ui/components';
import { App } from '@/src/library/App';
import './style.css';

render(<UiProvider><App /></UiProvider>, document.getElementById('app')!);
