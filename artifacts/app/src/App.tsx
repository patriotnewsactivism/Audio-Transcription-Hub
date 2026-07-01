import { Route, Switch } from "wouter";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import Recordings from "./pages/Recordings";
import RecordingDetail from "./pages/RecordingDetail";
import Gems from "./pages/Gems";

function Nav() {
  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center gap-6">
        <a href="/" className="text-lg font-bold text-white hover:text-blue-400">
          Audio Transcription Hub
        </a>
        <div className="flex gap-4 text-sm">
          <a href="/" className="text-gray-400 hover:text-white">Dashboard</a>
          <a href="/upload" className="text-gray-400 hover:text-white">Upload</a>
          <a href="/recordings" className="text-gray-400 hover:text-white">Recordings</a>
          <a href="/gems" className="text-gray-400 hover:text-white">Gems</a>
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950">
      <Nav />
      <main className="max-w-7xl mx-auto p-6">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/upload" component={Upload} />
          <Route path="/recordings" component={Recordings} />
          <Route path="/recordings/:id" component={RecordingDetail} />
          <Route path="/gems" component={Gems} />
        </Switch>
      </main>
    </div>
  );
}
