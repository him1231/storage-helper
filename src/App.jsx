import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import FloorplansPage from './pages/FloorplansPage.jsx';
import FloorplanEditor from './pages/FloorplanEditor.jsx';
import SearchPage from './pages/SearchPage.jsx';

export default function App() {
  const [q, setQ] = useState('');
  const nav = useNavigate();

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          Storage Helper
        </Link>
        <form
          className="search-form"
          onSubmit={(e) => {
            e.preventDefault();
            nav(`/search?q=${encodeURIComponent(q)}`);
          }}
        >
          <input
            type="search"
            placeholder="Search items…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<FloorplansPage />} />
          <Route path="/floorplan/:id" element={<FloorplanEditor />} />
          <Route path="/search" element={<SearchPage />} />
        </Routes>
      </main>
    </div>
  );
}
