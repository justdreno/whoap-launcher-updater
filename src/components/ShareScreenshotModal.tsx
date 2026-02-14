import React, { useState, useEffect } from 'react';
import { X, Upload, Users } from 'lucide-react';
import { Screenshot, ScreenshotApi } from '../api/screenshots';
import { ScreenshotImage } from './ScreenshotImage';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import styles from './ShareScreenshotModal.module.css';

interface ShareScreenshotModalProps {
    screenshot: Screenshot;
    user: any;
    onClose: () => void;
}

interface Friend {
    id: string;
    uuid: string;
    name: string;
    avatar?: string;
}

export const ShareScreenshotModal: React.FC<ShareScreenshotModalProps> = ({
    screenshot,
    user,
    onClose
}) => {
    const [friends, setFriends] = useState<Friend[]>([]);
    const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadToCloud, setUploadToCloud] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        loadFriends();
    }, []);

    const loadFriends = async () => {
        if (!user || user.type !== 'whoap') return;

        try {
            // Fetch friends from Supabase
            const { data, error } = await supabase
                .from('friends')
                .select(`
                    friend_uuid,
                    profiles!friends_friend_uuid_fkey (
                        uuid,
                        username
                    )
                `)
                .eq('user_uuid', user.uuid)
                .eq('status', 'accepted');

            if (error) throw error;

            const friendsList: Friend[] = data.map((f: any) => ({
                id: f.friend_uuid,
                uuid: f.friend_uuid,
                name: f.profiles?.username || 'Unknown',
            }));

            setFriends(friendsList);
        } catch (error) {
            console.error('Failed to load friends:', error);
        }
    };

    const handleToggleFriend = (friendId: string) => {
        setSelectedFriends(prev =>
            prev.includes(friendId)
                ? prev.filter(id => id !== friendId)
                : [...prev, friendId]
        );
    };

    const handleUploadToCloud = async () => {
        if (!user || user.type !== 'whoap') {
            showToast('Cloud sharing is only available for Whoap accounts', 'error');
            return;
        }

        setUploading(true);

        try {
            // Get screenshot data from electron
            const result = await ScreenshotApi.shareToCloud(screenshot.path, user.uuid);

            if (!result.success || !result.publicUrl || !result.hash) {
                throw new Error(result.error || 'Failed to prepare screenshot');
            }

            // Check for duplicate in database
            const { data: duplicate, error: checkError } = await supabase
                .from('shared_screenshots')
                .select('id, url')
                .eq('user_uuid', user.uuid)
                .eq('hash', result.hash)
                .maybeSingle();

            if (checkError) console.error('Duplicate check error:', checkError);

            if (duplicate) {
                // If it already exists, just show success and close
                showToast('Screenshot already uploaded to cloud!', 'info');
                onClose();
                return;
            }

            // Convert base64 to blob
            const base64Data = result.publicUrl;
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/png' });

            // Upload to Supabase Storage
            const filename = `${user.uuid}/${Date.now()}_${screenshot.filename}`;
            const { error: uploadError } = await supabase.storage
                .from('screenshots')
                .upload(filename, blob, {
                    contentType: 'image/png',
                    upsert: false
                });

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('screenshots')
                .getPublicUrl(filename);

            // Save screenshot metadata to database
            const { error: dbError } = await supabase
                .from('shared_screenshots')
                .insert({
                    user_uuid: user.uuid,
                    filename: screenshot.filename,
                    url: publicUrl,
                    hash: result.hash,
                    instance_name: screenshot.instanceName,
                    version: screenshot.version,
                    loader: screenshot.loader,
                    size: screenshot.size,
                    shared_with: selectedFriends.length > 0 ? selectedFriends : null
                });

            if (dbError) throw dbError;

            // If sharing with friends, create notifications
            if (selectedFriends.length > 0) {
                const notifications = selectedFriends.map(friendId => ({
                    user_uuid: friendId,
                    type: 'screenshot_shared',
                    message: `${user.name} shared a screenshot with you`,
                    data: { screenshot_url: publicUrl, from: user.uuid },
                    read: false
                }));

                await supabase.from('notifications').insert(notifications);
            }

            showToast(
                selectedFriends.length > 0
                    ? `Screenshot shared with ${selectedFriends.length} friend(s)`
                    : 'Screenshot uploaded to cloud',
                'success'
            );
            onClose();
        } catch (error) {
            console.error('Failed to share screenshot:', error);
            showToast('Failed to share screenshot', 'error');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2>Share Screenshot</h2>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.preview}>
                    <ScreenshotImage
                        screenshot={screenshot}
                        className={styles.previewImage}
                    />
                    <div className={styles.previewInfo}>
                        <div className={styles.previewTitle}>{screenshot.filename}</div>
                        <div className={styles.previewMeta}>
                            {screenshot.instanceName} • {screenshot.version}
                        </div>
                    </div>
                </div>

                <div className={styles.content}>
                    <label className={styles.checkbox}>
                        <input
                            type="checkbox"
                            checked={uploadToCloud}
                            onChange={(e) => setUploadToCloud(e.target.checked)}
                        />
                        <span>Upload to Whoap Cloud</span>
                    </label>

                    {uploadToCloud && friends.length > 0 && (
                        <div className={styles.friendsList}>
                            <div className={styles.friendsHeader}>
                                <Users size={18} />
                                <span>Share with friends (optional)</span>
                            </div>
                            <div className={styles.friends}>
                                {friends.map(friend => (
                                    <label key={friend.id} className={styles.friendItem}>
                                        <input
                                            type="checkbox"
                                            checked={selectedFriends.includes(friend.uuid)}
                                            onChange={() => handleToggleFriend(friend.uuid)}
                                        />
                                        <span>{friend.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {uploadToCloud && friends.length === 0 && user?.type === 'whoap' && (
                        <div className={styles.noFriends}>
                            <Users size={32} color="#666" />
                            <p>You don't have any friends yet.</p>
                            <p>Add friends to share screenshots with them!</p>
                        </div>
                    )}

                    {!user || user.type !== 'whoap' ? (
                        <div className={styles.notice}>
                            <p>Cloud sharing requires a Whoap account.</p>
                        </div>
                    ) : null}
                </div>

                <div className={styles.footer}>
                    <button className={styles.cancelBtn} onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className={styles.shareBtn}
                        onClick={handleUploadToCloud}
                        disabled={uploading || !uploadToCloud || !user || user.type !== 'whoap'}
                    >
                        {uploading ? (
                            'Uploading...'
                        ) : (
                            <>
                                <Upload size={18} />
                                {selectedFriends.length > 0
                                    ? `Share with ${selectedFriends.length} friend(s)`
                                    : 'Upload to Cloud'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
