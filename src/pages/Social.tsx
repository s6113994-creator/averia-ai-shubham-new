import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, Share2, Play, Pause, Volume2, VolumeX, Plus, Send, X, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Post {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  user_name?: string;
  user_avatar?: string;
  is_liked?: boolean;
}

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  views_count: number;
  expires_at: string;
  created_at: string;
  user_name?: string;
  user_avatar?: string;
}

interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_name?: string;
}

export default function Social() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePost, setActivePost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [muted, setMuted] = useState(true);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement }>({});

  useEffect(() => {
    fetchContent();
  }, []);

  const fetchContent = async () => {
    setLoading(true);
    try {
      // Fetch posts with user info
      const { data: postsData, error: postsError } = await supabase
        .from('user_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (postsError) throw postsError;

      // Fetch stories
      const { data: storiesData, error: storiesError } = await supabase
        .from('stories')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (storiesError) throw storiesError;

      // Get unique user IDs
      const userIds = [...new Set([
        ...(postsData || []).map((p) => p.user_id),
        ...(storiesData || []).map((s) => s.user_id),
      ])];

      // Fetch user profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.user_id, p])
      );

      // Check likes for current user
      let likedPostIds: string[] = [];
      if (user) {
        const { data: likes } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', user.id);
        likedPostIds = (likes || []).map((l) => l.post_id);
      }

      // Enrich posts
      const enrichedPosts = (postsData || []).map((post) => ({
        ...post,
        user_name: profileMap.get(post.user_id)?.full_name || 'User',
        user_avatar: profileMap.get(post.user_id)?.avatar_url,
        is_liked: likedPostIds.includes(post.id),
      }));

      // Enrich stories
      const enrichedStories = (storiesData || []).map((story) => ({
        ...story,
        user_name: profileMap.get(story.user_id)?.full_name || 'User',
        user_avatar: profileMap.get(story.user_id)?.avatar_url,
      }));

      setPosts(enrichedPosts);
      setStories(enrichedStories);
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (post: Post) => {
    if (!user) {
      navigate('/auth');
      return;
    }

    try {
      if (post.is_liked) {
        // Unlike
        await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', user.id);

        await supabase
          .from('user_posts')
          .update({ likes_count: post.likes_count - 1 })
          .eq('id', post.id);

        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? { ...p, is_liked: false, likes_count: p.likes_count - 1 }
              : p
          )
        );
      } else {
        // Like
        await supabase
          .from('post_likes')
          .insert({ post_id: post.id, user_id: user.id });

        await supabase
          .from('user_posts')
          .update({ likes_count: post.likes_count + 1 })
          .eq('id', post.id);

        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? { ...p, is_liked: true, likes_count: p.likes_count + 1 }
              : p
          )
        );
      }
    } catch (error) {
      console.error('Like error:', error);
    }
  };

  const openComments = async (post: Post) => {
    setActivePost(post);
    
    const { data, error } = await supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });

    if (!error && data) {
      // Fetch user info for comments
      const userIds = [...new Set(data.map((c) => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.user_id, p.full_name])
      );

      setComments(
        data.map((c) => ({
          ...c,
          user_name: profileMap.get(c.user_id) || 'User',
        }))
      );
    }
  };

  const submitComment = async () => {
    if (!user || !activePost || !newComment.trim()) return;

    try {
      const { data, error } = await supabase
        .from('post_comments')
        .insert({
          post_id: activePost.id,
          user_id: user.id,
          content: newComment.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      // Update comments count
      await supabase
        .from('user_posts')
        .update({ comments_count: activePost.comments_count + 1 })
        .eq('id', activePost.id);

      // Fetch user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .single();

      setComments((prev) => [
        ...prev,
        { ...data, user_name: profile?.full_name || 'User' },
      ]);

      setPosts((prev) =>
        prev.map((p) =>
          p.id === activePost.id
            ? { ...p, comments_count: p.comments_count + 1 }
            : p
        )
      );

      setNewComment('');
    } catch (error) {
      console.error('Comment error:', error);
      toast.error('Failed to add comment');
    }
  };

  const openStory = (story: Story, index: number) => {
    setActiveStory(story);
    setCurrentStoryIndex(index);
    setShowStoryViewer(true);

    // Record view
    if (user && story.user_id !== user.id) {
      supabase
        .from('story_views')
        .insert({ story_id: story.id, viewer_id: user.id })
        .then(() => {
          supabase
            .from('stories')
            .update({ views_count: story.views_count + 1 })
            .eq('id', story.id);
        });
    }
  };

  const nextStory = () => {
    if (currentStoryIndex < stories.length - 1) {
      const nextIndex = currentStoryIndex + 1;
      setCurrentStoryIndex(nextIndex);
      setActiveStory(stories[nextIndex]);
    } else {
      setShowStoryViewer(false);
    }
  };

  const prevStory = () => {
    if (currentStoryIndex > 0) {
      const prevIndex = currentStoryIndex - 1;
      setCurrentStoryIndex(prevIndex);
      setActiveStory(stories[prevIndex]);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-heading text-3xl font-bold">
              <span className="gradient-text">Community</span>
            </h1>
            {user && (
              <Button onClick={() => navigate('/create-post')}>
                <Plus className="h-4 w-4 mr-2" />
                Create
              </Button>
            )}
          </div>

          {/* Stories */}
          {stories.length > 0 && (
            <div className="mb-8">
              <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex gap-4 pb-4">
                  {stories.map((story, index) => (
                    <button
                      key={story.id}
                      onClick={() => openStory(story, index)}
                      className="flex flex-col items-center gap-2"
                    >
                      <div className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-br from-primary to-accent">
                        <Avatar className="w-full h-full border-2 border-background">
                          <AvatarImage src={story.user_avatar} />
                          <AvatarFallback>{story.user_name?.[0]}</AvatarFallback>
                        </Avatar>
                      </div>
                      <span className="text-xs text-muted-foreground truncate max-w-16">
                        {story.user_name}
                      </span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Reels Feed */}
          <div className="space-y-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No posts yet. Be the first to share!</p>
              </div>
            ) : (
              posts.map((post) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card rounded-xl overflow-hidden"
                >
                  {/* Post Header */}
                  <div className="p-4 flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={post.user_avatar} />
                      <AvatarFallback>{post.user_name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{post.user_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(post.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Media */}
                  {post.media_url && (
                    <div className="relative aspect-[9/16] max-h-[600px] bg-black">
                      {post.media_type === 'video' ? (
                        <video
                          ref={(el) => { if (el) videoRefs.current[post.id] = el; }}
                          src={post.media_url}
                          className="w-full h-full object-contain"
                          loop
                          muted={muted}
                          playsInline
                          onClick={(e) => {
                            const video = e.currentTarget;
                            if (video.paused) video.play();
                            else video.pause();
                          }}
                        />
                      ) : (
                        <img
                          src={post.media_url}
                          alt=""
                          className="w-full h-full object-contain"
                        />
                      )}

                      {/* Video controls overlay */}
                      {post.media_type === 'video' && (
                        <button
                          className="absolute bottom-4 right-4 p-2 bg-black/50 rounded-full"
                          onClick={() => setMuted(!muted)}
                        >
                          {muted ? (
                            <VolumeX className="h-5 w-5 text-white" />
                          ) : (
                            <Volume2 className="h-5 w-5 text-white" />
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Content */}
                  {post.content && (
                    <p className="px-4 py-2 text-sm">{post.content}</p>
                  )}

                  {/* Actions */}
                  <div className="p-4 flex items-center gap-6 border-t border-border/50">
                    <button
                      onClick={() => handleLike(post)}
                      className="flex items-center gap-2 transition-colors"
                    >
                      <Heart
                        className={`h-6 w-6 transition-all ${
                          post.is_liked
                            ? 'fill-destructive text-destructive scale-110'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      />
                      <span className="text-sm">{formatNumber(post.likes_count)}</span>
                    </button>

                    <button
                      onClick={() => openComments(post)}
                      className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <MessageCircle className="h-6 w-6" />
                      <span className="text-sm">{formatNumber(post.comments_count)}</span>
                    </button>

                    <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                      <Share2 className="h-6 w-6" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Comments Dialog */}
      <Dialog open={!!activePost} onOpenChange={(open) => !open && setActivePost(null)}>
        <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Comments</DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="flex-1 -mx-6 px-6">
            {comments.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No comments yet
              </p>
            ) : (
              <div className="space-y-4 py-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>{comment.user_name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{comment.user_name}</span>{' '}
                        {comment.content}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(comment.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {user && (
            <div className="flex gap-2 pt-4 border-t border-border">
              <Input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                className="bg-secondary/30"
              />
              <Button onClick={submitComment} disabled={!newComment.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Story Viewer */}
      <AnimatePresence>
        {showStoryViewer && activeStory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          >
            <button
              onClick={() => setShowStoryViewer(false)}
              className="absolute top-4 right-4 p-2 text-white z-10"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Navigation */}
            {currentStoryIndex > 0 && (
              <button
                onClick={prevStory}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 rounded-full z-10"
              >
                <ChevronLeft className="h-6 w-6 text-white" />
              </button>
            )}
            {currentStoryIndex < stories.length - 1 && (
              <button
                onClick={nextStory}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 rounded-full z-10"
              >
                <ChevronRight className="h-6 w-6 text-white" />
              </button>
            )}

            {/* Story Content */}
            <div className="relative w-full max-w-md h-full max-h-[90vh]">
              {/* Progress bars */}
              <div className="absolute top-2 left-2 right-2 flex gap-1 z-10">
                {stories.map((_, i) => (
                  <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-white transition-all ${
                        i < currentStoryIndex
                          ? 'w-full'
                          : i === currentStoryIndex
                          ? 'w-full animate-[progress_5s_linear]'
                          : 'w-0'
                      }`}
                    />
                  </div>
                ))}
              </div>

              {/* User info */}
              <div className="absolute top-8 left-4 flex items-center gap-3 z-10">
                <Avatar className="h-10 w-10 border-2 border-white">
                  <AvatarImage src={activeStory.user_avatar} />
                  <AvatarFallback>{activeStory.user_name?.[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-white font-medium text-sm">{activeStory.user_name}</p>
                  <p className="text-white/60 text-xs">
                    {new Date(activeStory.created_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              {/* Media */}
              {activeStory.media_type === 'video' ? (
                <video
                  src={activeStory.media_url}
                  className="w-full h-full object-contain"
                  autoPlay
                  muted={muted}
                  onEnded={nextStory}
                />
              ) : (
                <img
                  src={activeStory.media_url}
                  alt=""
                  className="w-full h-full object-contain"
                  onClick={nextStory}
                />
              )}

              {/* Caption */}
              {activeStory.caption && (
                <div className="absolute bottom-4 left-4 right-4 text-white text-sm bg-black/50 p-3 rounded-lg">
                  {activeStory.caption}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
