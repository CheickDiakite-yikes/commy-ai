import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LandingExperience } from './components/LandingExperience';
import './styles/theme.css';

const inStudioFromUrl = (): boolean => {
    const params = new URLSearchParams(window.location.search);
    return params.get('beta') === '1';
};

const RootExperience: React.FC = () => {
    const [isStudioMode, setIsStudioMode] = useState<boolean>(() => inStudioFromUrl());

    useEffect(() => {
        if (isStudioMode) {
            document.body.classList.add('studio-theme');
        } else {
            document.body.classList.remove('studio-theme');
        }
        return () => {
            document.body.classList.remove('studio-theme');
        };
    }, [isStudioMode]);

    const enterStudio = useCallback(() => {
        const url = new URL(window.location.href);
        url.searchParams.set('beta', '1');
        const search = url.searchParams.toString();
        window.history.replaceState({}, '', `${url.pathname}${search ? `?${search}` : ''}${url.hash}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setIsStudioMode(true);
    }, []);

    if (!isStudioMode) {
        return <LandingExperience onEnterApp={enterStudio} />;
    }

    return <App />;
};

const root = createRoot(document.getElementById('root')!);
root.render(<RootExperience />);
