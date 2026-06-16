declare module "@livekit/components-react" {
  import type {
    ComponentType,
    PropsWithChildren,
    ReactNode,
    RefAttributes,
  } from "react";

  export interface LiveKitRoomProps {
    audio?: boolean;
    children?: React.ReactNode;
    className?: string;
    connect?: boolean;
    onDisconnected?: () => void;
    serverUrl: string | undefined;
    token: string | undefined;
    video?: boolean;
  }

  export const LiveKitRoom: ComponentType<
    PropsWithChildren<LiveKitRoomProps> & RefAttributes<HTMLDivElement>
  >;

  export interface ParticipantTileProps {
    className?: string;
  }

  export const ParticipantTile: ComponentType<
    ParticipantTileProps & RefAttributes<HTMLDivElement>
  >;

  export interface TrackLoopProps {
    children?: ReactNode;
    tracks: ReadonlyArray<unknown>;
    className?: string;
  }

  export const TrackLoop: ComponentType<TrackLoopProps>;

  export function useTracks(...args: ReadonlyArray<unknown>): ReadonlyArray<unknown>;
}

declare module "@livekit/components-react/prefabs" {
  import type { ComponentType, RefAttributes } from "react";

  export interface ControlBarProps {
    className?: string;
    controls?: Record<string, boolean>;
  }

  export const ControlBar: ComponentType<
    ControlBarProps & RefAttributes<HTMLDivElement>
  >;
}

declare module "livekit-client" {
  export const Track: {
    Source: {
      Camera: string;
      Microphone: string;
    };
  };
}
