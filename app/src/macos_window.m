#import <AppKit/AppKit.h>
#include <stdbool.h>

static NSWindow *hitch_face_window_for_id(id host, unsigned long long window_id) {
    if (!host) return nil;

    @try {
        if (window_id == 1) {
            NSWindow *main = [host valueForKey:@"window"];
            if (main) return main;
        }

        NSMutableDictionary *windows = [host valueForKey:@"windows"];
        return windows[@(window_id)];
    } @catch (__unused NSException *exception) {
        return nil;
    }
}
static id hitch_face_host_for_context(void *platform_context) {
    if (!platform_context) return nil;
    void *host_ptr = *(void **)platform_context;
    if (!host_ptr) return nil;
    return (__bridge id)host_ptr;
}

static void hitch_face_set_content_size(NSWindow *window, double width, double height) {
    NSRect frame = window.frame;
    NSRect content = [window contentRectForFrameRect:frame];
    CGFloat chrome_height = frame.size.height - content.size.height;
    CGFloat new_frame_height = height + chrome_height;
    CGFloat delta_height = new_frame_height - frame.size.height;

    frame.size.width = width;
    frame.size.height = new_frame_height;
    frame.origin.y -= delta_height;

    [window setContentSize:NSMakeSize(width, height)];
    [window setFrame:frame display:YES animate:NO];
}

void hitch_face_configure_macos_window(void *platform_context, unsigned long long window_id, double width, double height) {
    id host = hitch_face_host_for_context(platform_context);
    NSWindow *window = hitch_face_window_for_id(host, window_id);
    if (!window) return;

    [window setStyleMask:NSWindowStyleMaskBorderless];
    [window setTitleVisibility:NSWindowTitleHidden];
    [window setTitlebarAppearsTransparent:YES];
    [window setOpaque:NO];
    [window setBackgroundColor:NSColor.clearColor];
    [window setHasShadow:NO];
    [window setMovableByWindowBackground:YES];
    [window setReleasedWhenClosed:NO];
    [window setLevel:NSFloatingWindowLevel];
    [window setCollectionBehavior:NSWindowCollectionBehaviorCanJoinAllSpaces |
                                  NSWindowCollectionBehaviorFullScreenAuxiliary |
                                  NSWindowCollectionBehaviorStationary];
    [window setIgnoresMouseEvents:NO];

    NSView *content = window.contentView;
    content.wantsLayer = YES;
    content.layer.backgroundColor = NSColor.clearColor.CGColor;

    hitch_face_set_content_size(window, width, height);
}


void hitch_face_resize_macos_window(void *platform_context, unsigned long long window_id, double width, double height) {
    id host = hitch_face_host_for_context(platform_context);
    NSWindow *window = hitch_face_window_for_id(host, window_id);
    if (!window) return;

    hitch_face_set_content_size(window, width, height);
}

bool hitch_face_get_macos_window_position(void *platform_context, unsigned long long window_id, double *x, double *y) {
    id host = hitch_face_host_for_context(platform_context);
    NSWindow *window = hitch_face_window_for_id(host, window_id);
    if (!window || !x || !y) return false;

    NSRect frame = window.frame;
    *x = frame.origin.x;
    *y = frame.origin.y;
    return true;
}

void hitch_face_set_macos_window_position(void *platform_context, unsigned long long window_id, double x, double y) {
    id host = hitch_face_host_for_context(platform_context);
    NSWindow *window = hitch_face_window_for_id(host, window_id);
    if (!window) return;

    NSRect frame = window.frame;
    frame.origin.x = x;
    frame.origin.y = y;
    [window setFrame:frame display:YES animate:NO];
}

void hitch_face_step_macos_window(void *platform_context, unsigned long long window_id, double *vx, double *vy, double speed) {
    id host = hitch_face_host_for_context(platform_context);
    NSWindow *window = hitch_face_window_for_id(host, window_id);
    if (!window || !vx || !vy) return;

    NSScreen *screen = window.screen ?: NSScreen.mainScreen;
    if (!screen) return;

    NSRect bounds = screen.visibleFrame;
    NSRect frame = window.frame;
    double next_x = frame.origin.x + (*vx * speed);
    double next_y = frame.origin.y + (*vy * speed);

    if (next_x <= NSMinX(bounds)) {
        next_x = NSMinX(bounds);
        *vx = fabs(*vx);
    } else if (next_x + frame.size.width >= NSMaxX(bounds)) {
        next_x = NSMaxX(bounds) - frame.size.width;
        *vx = -fabs(*vx);
    }

    if (next_y <= NSMinY(bounds)) {
        next_y = NSMinY(bounds);
        *vy = fabs(*vy);
    } else if (next_y + frame.size.height >= NSMaxY(bounds)) {
        next_y = NSMaxY(bounds) - frame.size.height;
        *vy = -fabs(*vy);
    }

    frame.origin.x = next_x;
    frame.origin.y = next_y;
    [window setFrame:frame display:YES animate:NO];
}

void hitch_face_close_macos_window(void *platform_context, unsigned long long window_id) {
    id host = hitch_face_host_for_context(platform_context);
    NSWindow *window = hitch_face_window_for_id(host, window_id);
    if (!window) return;
    [window close];
}
