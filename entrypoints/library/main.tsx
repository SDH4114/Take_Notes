// Library: full-tab workspace (projects, clips, highlights, books, editor). Owner: agent U1.
import { render } from 'preact';
import '@/src/ui/base.css';
import { initTheme } from '@/src/ui/theme';
import { UiProvider } from '@/src/ui/components';
import { App } from '@/src/library/App';
import './style.css';

initTheme();

render(<UiProvider><App /></UiProvider>, document.getElementById('app')!);
