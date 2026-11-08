// src/tv/components/TvChunkLoadBoundary.tsx

import React from 'react';
import { isChunkLoadError } from '../../utils/chunkLoadRecovery';

// 分包加载错误不能直接冒到 TV 根节点，否则 React 会卸载整棵树留下一块黑屏。
// 边界只接管分包错误，界面由 TvApp 的 failure 层负责，这样返回键和遥控器路由仍然可用。
type TvChunkLoadBoundaryProps = {
    children: React.ReactNode;
    onChunkError: (error: unknown) => void;
};

type TvChunkLoadBoundaryState = {
    error: unknown | null;
};

export class TvChunkLoadBoundary extends React.Component<
    TvChunkLoadBoundaryProps,
    TvChunkLoadBoundaryState
> {
    state: TvChunkLoadBoundaryState = { error: null };

    static getDerivedStateFromError(error: unknown): TvChunkLoadBoundaryState {
        return { error };
    }

    componentDidCatch(error: unknown): void {
        if (isChunkLoadError(error)) this.props.onChunkError(error);
    }

    render(): React.ReactNode {
        const { error } = this.state;
        if (!error) return this.props.children;
        if (!isChunkLoadError(error)) throw error;
        return null;
    }
}
