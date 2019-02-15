export interface FlashInfo {
    src: string;
    width: number;
    height: number;
}

export interface ImageInfo {
    src: string;
    width: number;
    height: number;
    transparency: boolean;
}

export interface VideoInfo {
    src: string;
    filesize: number;
    quality: string;
    duration: number;
}

export interface SizedImageInfo extends ImageInfo {
    filesize: number;
}

export interface DailyDeviationInfo {
    body: string;
    time: string;
    giver: UserInfo;
    suggester: UserInfo;
}

export interface ChallengeInfo {
    type: any[];
    completed: boolean;
    tags: any[];
    locked?: boolean;
    credit_deviation: string|null;
    media: any[];
    level_label?: string;
    time_limit?: number;
    levels?: string[];
}

export interface ChallengeEntryInfo {
    challengeid: string;
    challenge_title: string;
    challenge: DeviationInfo;
    timed_duration: number;
    submission_time: string;
}

export interface DeviationInfo {
    deviationid: string;
    printid?: string;
    url?: string;
    title?: string;
    category?: string;
    category_path?: string;
    is_favourited?: string;
    is_deleted?: string;
    author?: UserInfo;
    stats?: { comments: number; favourites: number};
    published_time?: string
    allows_comments?: boolean;
    preview?: ImageInfo;
    content?: SizedImageInfo;
    thumbs?: ImageInfo[];
    videos?: VideoInfo[];
    flash?: FlashInfo;
    daily_deviation: DailyDeviationInfo;
    excerpt?: string;
    is_mature?: boolean;
    is_downloadable?: boolean;
    download_filesize?: number;
    challenge?: ChallengeInfo;
    challenge_entry?: ChallengeEntryInfo;
    motion_book?: { embed_url: string; }
}

export interface UserProfileInfo {
    user_is_artist: boolean;
    artist_level: string|null;
    artist_specialty: string|null;
    real_name: string;
    tagline: string;
    website: string;
    cover_photo: string;
    profile_pic: DeviationInfo;
}

export interface UserInfo {
    userid: string;
    username: string;
    usericon: string;
    type: string;
    is_watching?: boolean;
    details?: { sex: string|null, age: number|null, joindate: string };
    geo?: { country: string, countryid: number, timezone: string };
    profile?: UserProfileInfo;
    stats?: { watchers: number, friends: number };
}

