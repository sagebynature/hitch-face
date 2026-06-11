const std = @import("std");
const runner = @import("runner");
const zero_native = @import("zero-native");

pub const panic = std.debug.FullPanic(zero_native.debug.capturePanic);

const closed_window_width: f64 = 310;
const closed_window_height: f64 = 370;
const open_window_width: f64 = 510;
const open_window_height: f64 = 370;
const max_sessions = 8;
const max_events_per_session = 32;
const max_event_bytes = 8192;
const max_config_bytes = 8192;
const default_session_id = "default-session";
const default_harness = "default";

extern fn hitch_face_configure_macos_window(platform_context: ?*anyopaque, window_id: u64, width: f64, height: f64) void;
extern fn hitch_face_resize_macos_window(platform_context: ?*anyopaque, window_id: u64, width: f64, height: f64) void;
extern fn hitch_face_close_macos_window(platform_context: ?*anyopaque, window_id: u64) void;
extern fn hitch_face_hide_macos_window(platform_context: ?*anyopaque, window_id: u64) void;
extern fn hitch_face_show_macos_window(platform_context: ?*anyopaque, window_id: u64) void;
extern fn hitch_face_get_macos_window_position(platform_context: ?*anyopaque, window_id: u64, x: *f64, y: *f64) bool;
extern fn hitch_face_set_macos_window_position(platform_context: ?*anyopaque, window_id: u64, x: f64, y: f64) void;
extern fn hitch_face_step_macos_window(platform_context: ?*anyopaque, window_id: u64, vx: *f64, vy: *f64, speed: f64) void;

const action_start_events = [_][]const u8{
    "session.started",
    "turn.started",
    "tool.requested",
    "llm.requested",
    "subagent.started",
    "retry.started",
};

const action_stop_events = [_][]const u8{
    "session.ended",
    "turn.completed",
    "tool.completed",
    "llm.completed",
    "subagent.completed",
    "retry.completed",
    "error.reported",
    "turn.assistant_completed",
};

const Config = struct {
    speed: f64 = 1.0,
    interval_ms: u64 = 100,
    port: u16 = 8888,
    ticker_speed_s: f64 = 15,
    buffer_size: u32 = 500,
    movement_enabled: bool = false,
    colors: [16]Color = undefined,
    color_count: usize = 0,

    fn addColor(self: *Config, key: []const u8, value: []const u8) void {
        if (self.color_count >= self.colors.len) return;
        self.colors[self.color_count].set(key, value);
        self.color_count += 1;
    }
};

const Color = struct {
    key: [48]u8 = undefined,
    key_len: usize = 0,
    value: [64]u8 = undefined,
    value_len: usize = 0,

    fn set(self: *Color, key: []const u8, value: []const u8) void {
        self.key_len = @min(key.len, self.key.len);
        @memcpy(self.key[0..self.key_len], key[0..self.key_len]);
        self.value_len = @min(value.len, self.value.len);
        @memcpy(self.value[0..self.value_len], value[0..self.value_len]);
    }
};

const QueuedEvent = struct {
    bytes: [max_event_bytes]u8 = undefined,
    len: usize = 0,

    fn set(self: *QueuedEvent, bytes: []const u8) void {
        self.len = @min(bytes.len, self.bytes.len);
        @memcpy(self.bytes[0..self.len], bytes[0..self.len]);
    }
};

const Session = struct {
    active: bool = false,
    id: [128]u8 = undefined,
    id_len: usize = 0,
    harness: [64]u8 = undefined,
    harness_len: usize = 0,
    window_id: zero_native.WindowId = 0,
    window_created: bool = false,
    window_visible: bool = false,
    event_received: bool = false,
    ready: bool = false,
    events: [max_events_per_session]QueuedEvent = undefined,
    event_count: usize = 0,
    drawer_open: bool = false,
    moving: bool = false,
    original_valid: bool = false,
    restore_pending: bool = false,
    original_x: f64 = 0,
    original_y: f64 = 0,
    vx: f64 = 40,
    vy: f64 = 30,

    fn init(self: *Session, id: []const u8, harness: []const u8, window_id: zero_native.WindowId) void {
        self.* = .{ .active = true, .window_id = window_id, .window_created = window_id == 1 };
        self.id_len = @min(id.len, self.id.len);
        @memcpy(self.id[0..self.id_len], id[0..self.id_len]);
        self.harness_len = @min(harness.len, self.harness.len);
        @memcpy(self.harness[0..self.harness_len], harness[0..self.harness_len]);
    }

    fn idSlice(self: *const Session) []const u8 {
        return self.id[0..self.id_len];
    }

    fn harnessSlice(self: *const Session) []const u8 {
        return self.harness[0..self.harness_len];
    }

    fn enqueue(self: *Session, envelope: []const u8) void {
        if (self.event_count == self.events.len) {
            var i: usize = 1;
            while (i < self.event_count) : (i += 1) self.events[i - 1] = self.events[i];
            self.event_count -= 1;
        }
        self.events[self.event_count].set(envelope);
        self.event_count += 1;
    }
};

const RequestKind = enum { event, expression };

const App = struct {
    env_map: *std.process.Environ.Map,
    io: std.Io,
    mutex: std.Io.Mutex = .init,
    config: Config = .{},
    runtime: ?*zero_native.Runtime = null,
    sessions: [max_sessions]Session = undefined,
    session_count: usize = 0,
    next_window_id: zero_native.WindowId = 1,
    handlers: [7]zero_native.BridgeHandler = undefined,
    policies: [7]zero_native.BridgeCommandPolicy = undefined,

    fn init(env_map: *std.process.Environ.Map, io: std.Io) App {
        var state = App{ .env_map = env_map, .io = io };
        state.sessions = undefined;
        state.config = loadConfig(io, env_map);
        return state;
    }

    fn app(self: *@This()) zero_native.App {
        return .{
            .context = self,
            .name = "hitch-face",
            .source = zero_native.frontend.productionSource(.{ .dist = "frontend/dist", .entry = "index.html" }),
            .source_fn = source,
            .start_fn = onStart,
            .event_fn = onEvent,
        };
    }

    fn bridge(self: *@This()) zero_native.BridgeDispatcher {
        self.handlers = .{
            .{ .name = "hitch.getConfig", .context = self, .invoke_fn = getConfig },
            .{ .name = "hitch.getSession", .context = self, .invoke_fn = getSession },
            .{ .name = "hitch.nextEvents", .context = self, .invoke_fn = nextEvents },
            .{ .name = "hitch.closeSession", .context = self, .invoke_fn = closeSession },
            .{ .name = "hitch.setExpression", .context = self, .invoke_fn = setExpression },
            .{ .name = "hitch.setDrawerOpen", .context = self, .invoke_fn = setDrawerOpen },
            .{ .name = "hitch.dragWindow", .context = self, .invoke_fn = dragWindow },
        };
        self.policies = .{
            .{ .name = "hitch.getConfig", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
            .{ .name = "hitch.getSession", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
            .{ .name = "hitch.nextEvents", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
            .{ .name = "hitch.closeSession", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
            .{ .name = "hitch.setExpression", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
            .{ .name = "hitch.setDrawerOpen", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
            .{ .name = "hitch.dragWindow", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
        };
        return .{ .policy = .{ .enabled = true, .commands = &self.policies }, .registry = .{ .handlers = &self.handlers } };
    }

    fn source(context: *anyopaque) anyerror!zero_native.WebViewSource {
        const self: *@This() = @ptrCast(@alignCast(context));
        return zero_native.frontend.sourceFromEnv(self.env_map, .{ .dist = "frontend/dist", .entry = "index.html" });
    }

    fn onStart(context: *anyopaque, runtime: *zero_native.Runtime) anyerror!void {
        const self: *@This() = @ptrCast(@alignCast(context));
        self.runtime = runtime;
        configureNativeWindow(runtime, 1, closed_window_width, closed_window_height);
        hideNativeWindow(runtime, 1);
        const thread = try std.Thread.spawn(.{}, serve, .{self});
        thread.detach();
        std.debug.print("Hitch Face zero-native listening on http://127.0.0.1:{d}/event\n", .{self.config.port});
    }
    fn onEvent(context: *anyopaque, runtime: *zero_native.Runtime, event: zero_native.Event) anyerror!void {
        if (event != .lifecycle or event.lifecycle != .frame) return;
        const self: *@This() = @ptrCast(@alignCast(context));
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);
        for (self.sessions[0..self.session_count]) |*session| {
            if (!session.active or !session.event_received) continue;
            if (!session.window_created and session.window_id != 1) try self.createWindowForSession(runtime, session);
            if (session.window_created and !session.window_visible) {
                showNativeWindow(runtime, session.window_id);
                session.window_visible = true;
            }
            self.driveMovement(runtime, session);
        }
    }

    fn ensureSession(self: *@This(), session_id: []const u8, harness: []const u8) !*Session {
        if (self.findSessionById(session_id)) |session| return session;
        if (self.session_count >= self.sessions.len) return error.SessionLimitReached;

        const index = self.session_count;
        const window_id = self.next_window_id;
        self.next_window_id += 1;
        self.session_count += 1;
        self.sessions[index].init(session_id, harness, window_id);

        return &self.sessions[index];
    }

    fn driveMovement(self: *@This(), runtime: *zero_native.Runtime, session: *Session) void {
        if (!self.config.movement_enabled or !session.window_created) return;
        if (session.restore_pending) {
            if (session.original_valid) setNativeWindowPosition(runtime, session.window_id, session.original_x, session.original_y);
            session.restore_pending = false;
            session.original_valid = false;
            return;
        }
        if (!session.moving) return;
        if (!session.original_valid) {
            if (getNativeWindowPosition(runtime, session.window_id, &session.original_x, &session.original_y)) {
                session.original_valid = true;
            }
        }
        stepNativeWindow(runtime, session.window_id, &session.vx, &session.vy, self.config.speed);
    }

    fn createWindowForSession(self: *@This(), runtime: *zero_native.Runtime, session: *Session) !void {
        _ = self;
        var label_buf: [64]u8 = undefined;
        const label = std.fmt.bufPrint(&label_buf, "session-{d}", .{session.window_id}) catch "session";
        _ = try runtime.createWindow(.{
            .id = session.window_id,
            .label = label,
            .title = "Hitch Face",
            .default_frame = zero_native.geometry.RectF.init(0, 0, closed_window_width, closed_window_height),
            .resizable = false,
            .restore_state = false,
        });
        configureNativeWindow(runtime, session.window_id, closed_window_width, closed_window_height);
        session.window_created = true;
    }

    fn findSessionById(self: *@This(), session_id: []const u8) ?*Session {
        for (self.sessions[0..self.session_count]) |*session| {
            if (session.active and std.mem.eql(u8, session.idSlice(), session_id)) return session;
        }
        return null;
    }

    fn findSessionByWindow(self: *@This(), window_id: zero_native.WindowId) ?*Session {
        for (self.sessions[0..self.session_count]) |*session| {
            if (session.active and session.window_id == window_id) return session;
        }
        return null;
    }

    fn removeSessionByWindow(self: *@This(), window_id: zero_native.WindowId) void {
        var i: usize = 0;
        while (i < self.session_count) : (i += 1) {
            if (self.sessions[i].active and self.sessions[i].window_id == window_id) {
                var j = i + 1;
                while (j < self.session_count) : (j += 1) self.sessions[j - 1] = self.sessions[j];
                self.session_count -= 1;
                return;
            }
        }
    }

    fn handleEvent(self: *@This(), kind: RequestKind, body: []const u8, envelope_out: []u8) !EventResult {
        if (!isLikelyJsonObject(body)) return error.PayloadMustBeObject;

        const expr = switch (kind) {
            .expression => extractTopLevelJsonString(body, "expression") orelse return error.MissingEventType,
            .event => extractTopLevelJsonString(body, "hitch_event_type") orelse return error.MissingEventType,
        };
        const envelope = switch (kind) {
            .expression => try std.fmt.bufPrint(envelope_out, "{{\"hitch_event_type\":\"{s}\",\"harness\":\"omp\",\"payload\":{{}}}}", .{expr}),
            .event => body,
        };
        const harness = extractTopLevelJsonString(envelope, "harness") orelse default_harness;
        const session_id = extractSessionId(envelope) orelse default_session_id;

        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);
        const session = try self.ensureSession(session_id, harness);
        session.enqueue(envelope);
        session.event_received = true;
        if (self.config.movement_enabled) {
            if (containsEvent(&action_start_events, expr)) {
                session.moving = true;
                session.restore_pending = false;
            } else if (containsEvent(&action_stop_events, expr)) {
                session.moving = false;
                session.restore_pending = true;
            }
        }
        return .{ .expr = expr, .session_id = session.idSlice() };
    }

    fn getConfig(context: *anyopaque, invocation: zero_native.bridge.Invocation, output: []u8) anyerror![]const u8 {
        _ = invocation;
        const self: *@This() = @ptrCast(@alignCast(context));
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);
        return writeConfigJson(self.config, output);
    }

    fn getSession(context: *anyopaque, invocation: zero_native.bridge.Invocation, output: []u8) anyerror![]const u8 {
        const self: *@This() = @ptrCast(@alignCast(context));
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);
        const session = self.findSessionByWindow(invocation.source.window_id) orelse try self.ensureSession(default_session_id, default_harness);
        session.ready = true;
        return std.fmt.bufPrint(output, "{{\"sessionId\":\"{s}\",\"harness\":\"{s}\"}}", .{ session.idSlice(), session.harnessSlice() });
    }

    fn nextEvents(context: *anyopaque, invocation: zero_native.bridge.Invocation, output: []u8) anyerror![]const u8 {
        const self: *@This() = @ptrCast(@alignCast(context));
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);
        const session = self.findSessionByWindow(invocation.source.window_id) orelse return std.fmt.bufPrint(output, "{{\"events\":[]}}", .{});
        session.ready = true;
        var writer = std.Io.Writer.fixed(output);
        try writer.writeAll("{\"events\":[");
        for (session.events[0..session.event_count], 0..) |event, i| {
            if (i != 0) try writer.writeAll(",");
            try writer.writeAll(event.bytes[0..event.len]);
        }
        session.event_count = 0;
        try writer.writeAll("]}");
        return writer.buffered();
    }

    fn closeSession(context: *anyopaque, invocation: zero_native.bridge.Invocation, output: []u8) anyerror![]const u8 {
        const self: *@This() = @ptrCast(@alignCast(context));
        const window_id = invocation.source.window_id;
        if (self.runtime) |runtime| {
            runtime.options.platform.services.closeWindow(window_id) catch closeNativeWindow(runtime, window_id);
        }
        self.mutex.lockUncancelable(self.io);
        self.removeSessionByWindow(window_id);
        self.mutex.unlock(self.io);
        return std.fmt.bufPrint(output, "{{\"ok\":true}}", .{});
    }

    fn setExpression(context: *anyopaque, invocation: zero_native.bridge.Invocation, output: []u8) anyerror![]const u8 {
        const self: *@This() = @ptrCast(@alignCast(context));
        var envelope: [max_event_bytes]u8 = undefined;
        _ = self.handleEvent(.expression, invocation.request.payload, &envelope) catch {};
        return std.fmt.bufPrint(output, "{{\"ok\":true}}", .{});
    }

    fn setDrawerOpen(context: *anyopaque, invocation: zero_native.bridge.Invocation, output: []u8) anyerror![]const u8 {
        const self: *@This() = @ptrCast(@alignCast(context));
        const open = std.mem.indexOf(u8, invocation.request.payload, "\"open\":true") != null;
        const window_id = invocation.source.window_id;
        if (self.runtime) |runtime| resizeNativeWindow(runtime, window_id, if (open) open_window_width else closed_window_width, if (open) open_window_height else closed_window_height);
        self.mutex.lockUncancelable(self.io);
        if (self.findSessionByWindow(window_id)) |session| session.drawer_open = open;
        self.mutex.unlock(self.io);
        return std.fmt.bufPrint(output, "{{\"ok\":true,\"open\":{s}}}", .{if (open) "true" else "false"});
    }
    fn dragWindow(context: *anyopaque, invocation: zero_native.bridge.Invocation, output: []u8) anyerror![]const u8 {
        const self: *@This() = @ptrCast(@alignCast(context));
        const dx = extractJsonNumber(invocation.request.payload, "dx") orelse 0;
        const dy = extractJsonNumber(invocation.request.payload, "dy") orelse 0;
        const window_id = invocation.source.window_id;
        if (self.runtime) |runtime| {
            var x: f64 = 0;
            var y: f64 = 0;
            if (getNativeWindowPosition(runtime, window_id, &x, &y)) {
                setNativeWindowPosition(runtime, window_id, x + dx, y - dy);
            }
        }
        return std.fmt.bufPrint(output, "{{\"ok\":true}}", .{});
    }
};

const EventResult = struct {
    expr: []const u8,
    session_id: []const u8,
};

const dev_origins = [_][]const u8{ "zero://app", "zero://inline", "http://127.0.0.1:5173" };

pub fn main(init: std.process.Init) !void {
    var app_state = App.init(init.environ_map, init.io);
    try runner.runWithOptions(app_state.app(), .{
        .app_name = "Hitch Face",
        .window_title = "Hitch Face",
        .bundle_id = "dev.hitch_face.app",
        .icon_path = "assets/icon.icns",
        .bridge = app_state.bridge(),
        .security = .{ .navigation = .{ .allowed_origins = &dev_origins } },
    }, init);
}

fn serve(app: *App) !void {
    const address = try std.Io.net.IpAddress.parseIp4("127.0.0.1", app.config.port);
    var server = try address.listen(app.io, .{ .reuse_address = true });
    defer server.deinit(app.io);

    while (true) {
        const stream = server.accept(app.io) catch continue;
        handleConnection(app, stream) catch {};
    }
}

fn readHttpRequest(reader: *std.Io.Reader) ![]const u8 {
    while (true) {
        reader.fillMore() catch |err| switch (err) {
            error.EndOfStream => break,
            else => return err,
        };
        const buffered = reader.buffer[reader.seek..reader.end];
        const header_end = std.mem.indexOf(u8, buffered, "\r\n\r\n") orelse continue;
        const body_start = header_end + 4;
        const content_length = parseContentLength(buffered[0..header_end]);
        const total_len = body_start + content_length;
        while (buffered.len < total_len) {
            reader.fillMore() catch |err| switch (err) {
                error.EndOfStream => return error.EndOfStream,
                else => return err,
            };
            const updated = reader.buffer[reader.seek..reader.end];
            if (updated.len >= total_len) return updated[0..total_len];
        }
        return buffered[0..total_len];
    }
    return reader.buffer[reader.seek..reader.end];
}

fn parseContentLength(headers: []const u8) usize {
    var lines = std.mem.splitSequence(u8, headers, "\r\n");
    while (lines.next()) |line| {
        const colon = std.mem.indexOfScalar(u8, line, ':') orelse continue;
        const name = std.mem.trim(u8, line[0..colon], &std.ascii.whitespace);
        if (!std.ascii.eqlIgnoreCase(name, "content-length")) continue;
        const value = std.mem.trim(u8, line[colon + 1 ..], &std.ascii.whitespace);
        return std.fmt.parseInt(usize, value, 10) catch 0;
    }
    return 0;
}

fn handleConnection(app: *App, stream: std.Io.net.Stream) !void {
    defer stream.close(app.io);

    var read_storage: [max_event_bytes]u8 = undefined;
    var reader = stream.reader(app.io, &read_storage);
    const request = try readHttpRequest(&reader.interface);

    if (std.mem.startsWith(u8, request, "OPTIONS ")) {
        try sendResponse(app, stream, 204, "No Content", "application/json", "");
        return;
    }

    const kind: RequestKind = if (std.mem.startsWith(u8, request, "POST /event "))
        .event
    else if (std.mem.startsWith(u8, request, "POST /expression "))
        .expression
    else {
        try sendResponse(app, stream, 404, "Not Found", "text/plain", "Not Found");
        return;
    };

    const body = if (std.mem.indexOf(u8, request, "\r\n\r\n")) |idx| request[idx + 4 ..] else "";
    if (!isLikelyJson(body)) {
        try sendResponse(app, stream, 400, "Bad Request", "application/json", "{\"status\":\"error\",\"reason\":\"Invalid JSON\"}");
        return;
    }

    var envelope: [max_event_bytes]u8 = undefined;
    const result = app.handleEvent(kind, body, &envelope) catch |err| {
        const reason = switch (err) {
            error.PayloadMustBeObject => "Payload must be an object",
            error.MissingEventType => "Missing event type (hitch_event_type or expression)",
            else => "Internal Server Error",
        };
        const status: u16 = if (err == error.PayloadMustBeObject or err == error.MissingEventType) 400 else 500;
        var response_buf: [128]u8 = undefined;
        const response = try std.fmt.bufPrint(&response_buf, "{{\"status\":\"error\",\"reason\":\"{s}\"}}", .{reason});
        try sendResponse(app, stream, status, if (status == 400) "Bad Request" else "Internal Server Error", "application/json", response);
        return;
    };

    var response_buf: [192]u8 = undefined;
    const response = try std.fmt.bufPrint(&response_buf, "{{\"status\":\"ok\",\"event\":\"{s}\"}}", .{result.expr});
    try sendResponse(app, stream, 200, "OK", "application/json", response);
}

fn sendResponse(app: *App, stream: std.Io.net.Stream, status: u16, reason: []const u8, content_type: []const u8, body: []const u8) !void {
    var header: [384]u8 = undefined;
    const response_header = try std.fmt.bufPrint(
        &header,
        "HTTP/1.1 {d} {s}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, GET, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Type: {s}\r\nContent-Length: {d}\r\nConnection: close\r\n\r\n",
        .{ status, reason, content_type, body.len },
    );
    try writeResponse(app, stream, response_header);
    if (body.len > 0) try writeResponse(app, stream, body);
}

fn writeResponse(app: *App, stream: std.Io.net.Stream, bytes: []const u8) !void {
    var write_storage: [1024]u8 = undefined;
    var writer = stream.writer(app.io, &write_storage);
    try writer.interface.writeAll(bytes);
    try writer.interface.flush();
}

fn configureNativeWindow(runtime: *zero_native.Runtime, window_id: u64, width: f64, height: f64) void {
    if (comptime @import("builtin").target.os.tag == .macos) {
        hitch_face_configure_macos_window(runtime.options.platform.services.context, window_id, width, height);
    }
}

fn resizeNativeWindow(runtime: *zero_native.Runtime, window_id: u64, width: f64, height: f64) void {
    if (comptime @import("builtin").target.os.tag == .macos) {
        hitch_face_resize_macos_window(runtime.options.platform.services.context, window_id, width, height);
    }
}

fn hideNativeWindow(runtime: *zero_native.Runtime, window_id: u64) void {
    if (comptime @import("builtin").target.os.tag == .macos) {
        hitch_face_hide_macos_window(runtime.options.platform.services.context, window_id);
    }
}

fn showNativeWindow(runtime: *zero_native.Runtime, window_id: u64) void {
    if (comptime @import("builtin").target.os.tag == .macos) {
        hitch_face_show_macos_window(runtime.options.platform.services.context, window_id);
    }
}

fn getNativeWindowPosition(runtime: *zero_native.Runtime, window_id: u64, x: *f64, y: *f64) bool {
    if (comptime @import("builtin").target.os.tag == .macos) {
        return hitch_face_get_macos_window_position(runtime.options.platform.services.context, window_id, x, y);
    }
    return false;
}

fn setNativeWindowPosition(runtime: *zero_native.Runtime, window_id: u64, x: f64, y: f64) void {
    if (comptime @import("builtin").target.os.tag == .macos) {
        hitch_face_set_macos_window_position(runtime.options.platform.services.context, window_id, x, y);
    }
}

fn stepNativeWindow(runtime: *zero_native.Runtime, window_id: u64, vx: *f64, vy: *f64, speed: f64) void {
    if (comptime @import("builtin").target.os.tag == .macos) {
        hitch_face_step_macos_window(runtime.options.platform.services.context, window_id, vx, vy, speed);
    }
}

fn closeNativeWindow(runtime: *zero_native.Runtime, window_id: u64) void {
    if (comptime @import("builtin").target.os.tag == .macos) {
        hitch_face_close_macos_window(runtime.options.platform.services.context, window_id);
    }
}

fn loadConfig(io: std.Io, env_map: *std.process.Environ.Map) Config {
    var config: Config = .{};
    const home = env_map.get("HOME") orelse return config;
    var path_buf: [1024]u8 = undefined;
    const path = std.fmt.bufPrint(&path_buf, "{s}/.config/hitch-face/config.toml", .{home}) catch return config;
    var file = std.Io.Dir.cwd().openFile(io, path, .{}) catch return config;
    defer file.close(io);
    var content: [max_config_bytes]u8 = undefined;
    const len = file.readPositionalAll(io, &content, 0) catch return config;
    parseConfig(content[0..len], &config);
    return config;
}

fn parseConfig(content: []const u8, config: *Config) void {
    var section: enum { root, colors } = .root;
    var lines = std.mem.splitScalar(u8, content, '\n');
    while (lines.next()) |raw_line| {
        const no_cr = std.mem.trim(u8, raw_line, "\r");
        const trimmed = std.mem.trim(u8, no_cr, &std.ascii.whitespace);
        if (trimmed.len == 0 or trimmed[0] == '#') continue;
        if (std.mem.eql(u8, trimmed, "[colors]")) {
            section = .colors;
            continue;
        }
        if (trimmed[0] == '[') {
            section = .root;
            continue;
        }
        const eq = std.mem.indexOfScalar(u8, trimmed, '=') orelse continue;
        const key = std.mem.trim(u8, trimmed[0..eq], &std.ascii.whitespace);
        const value = trimTomlValue(trimmed[eq + 1 ..]);
        if (section == .colors) {
            config.addColor(key, value);
        } else if (std.mem.eql(u8, key, "speed")) {
            config.speed = std.fmt.parseFloat(f64, value) catch config.speed;
        } else if (std.mem.eql(u8, key, "interval_ms")) {
            config.interval_ms = std.fmt.parseInt(u64, value, 10) catch config.interval_ms;
        } else if (std.mem.eql(u8, key, "port")) {
            config.port = std.fmt.parseInt(u16, value, 10) catch config.port;
        } else if (std.mem.eql(u8, key, "ticker_speed_s")) {
            config.ticker_speed_s = std.fmt.parseFloat(f64, value) catch config.ticker_speed_s;
        } else if (std.mem.eql(u8, key, "buffer_size")) {
            config.buffer_size = std.fmt.parseInt(u32, value, 10) catch config.buffer_size;
        } else if (std.mem.eql(u8, key, "movement_enabled")) {
            config.movement_enabled = std.mem.eql(u8, value, "true");
        }
    }
}

fn trimTomlValue(raw: []const u8) []const u8 {
    var value = std.mem.trim(u8, raw, &std.ascii.whitespace);
    if (value.len >= 2 and value[0] == '"' and value[value.len - 1] == '"') value = value[1 .. value.len - 1];
    return value;
}

fn writeConfigJson(config: Config, output: []u8) ![]const u8 {
    var writer = std.Io.Writer.fixed(output);
    try writer.print("{{\"ticker_speed_s\":{d},\"buffer_size\":{d},\"colors\":{{", .{ config.ticker_speed_s, config.buffer_size });
    for (config.colors[0..config.color_count], 0..) |color, i| {
        if (i != 0) try writer.writeAll(",");
        try writer.print("\"{s}\":\"{s}\"", .{ color.key[0..color.key_len], color.value[0..color.value_len] });
    }
    try writer.writeAll("}}");
    try writer.writeAll("}");
    return writer.buffered();
}

fn isLikelyJson(bytes: []const u8) bool {
    return std.json.Scanner.validate(std.heap.smp_allocator, bytes) catch false;
}

fn isLikelyJsonObject(bytes: []const u8) bool {
    const trimmed = std.mem.trim(u8, bytes, &std.ascii.whitespace);
    return trimmed.len >= 2 and trimmed[0] == '{';
}

fn extractJsonString(json: []const u8, key: []const u8) ?[]const u8 {
    var needle_buf: [64]u8 = undefined;
    if (key.len + 4 > needle_buf.len) return null;
    const needle = std.fmt.bufPrint(&needle_buf, "\"{s}\"", .{key}) catch return null;
    const key_pos = std.mem.indexOf(u8, json, needle) orelse return null;
    const after_key = json[key_pos + needle.len ..];
    const colon = std.mem.indexOfScalar(u8, after_key, ':') orelse return null;
    var value = std.mem.trimStart(u8, after_key[colon + 1 ..], &std.ascii.whitespace);
    if (value.len == 0 or value[0] != '"') return null;
    value = value[1..];
    const end = std.mem.indexOfScalar(u8, value, '"') orelse return null;
    return value[0..end];
}

fn extractTopLevelJsonString(json: []const u8, key: []const u8) ?[]const u8 {
    const value = findTopLevelJsonValue(json, key) orelse return null;
    return extractJsonStringValue(value);
}

fn findTopLevelJsonValue(json: []const u8, key: []const u8) ?[]const u8 {
    var depth: usize = 0;
    var in_string = false;
    var escaped = false;
    var i: usize = 0;

    while (i < json.len) : (i += 1) {
        const ch = json[i];
        if (in_string) {
            if (escaped) {
                escaped = false;
            } else if (ch == '\\') {
                escaped = true;
            } else if (ch == '"') {
                in_string = false;
            }
            continue;
        }

        switch (ch) {
            '"' => {
                if (depth != 1) {
                    in_string = true;
                    continue;
                }

                const key_start = i + 1;
                const key_end = std.mem.indexOfScalar(u8, json[key_start..], '"') orelse return null;
                const actual_key = json[key_start .. key_start + key_end];
                i = key_start + key_end;

                var after_key = std.mem.trimStart(u8, json[i + 1 ..], &std.ascii.whitespace);
                if (after_key.len == 0 or after_key[0] != ':') continue;
                after_key = std.mem.trimStart(u8, after_key[1..], &std.ascii.whitespace);
                if (std.mem.eql(u8, actual_key, key)) return after_key;
            },
            '{', '[' => depth += 1,
            '}', ']' => {
                if (depth == 0) return null;
                depth -= 1;
            },
            else => {},
        }
    }
    return null;
}

fn extractJsonStringValue(value: []const u8) ?[]const u8 {
    if (value.len == 0 or value[0] != '"') return null;
    const string_value = value[1..];
    const end = std.mem.indexOfScalar(u8, string_value, '"') orelse return null;
    return string_value[0..end];
}

fn extractPayloadSessionId(json: []const u8) ?[]const u8 {
    const payload = findTopLevelJsonValue(json, "payload") orelse return null;
    const session = findTopLevelJsonValue(payload, "session") orelse return null;
    return extractTopLevelJsonString(session, "id");
}

fn extractSessionId(json: []const u8) ?[]const u8 {
    if (extractTopLevelJsonString(json, "session_id")) |id| return id;
    return extractPayloadSessionId(json);
}
fn extractJsonNumber(json: []const u8, key: []const u8) ?f64 {
    var needle_buf: [64]u8 = undefined;
    if (key.len + 4 > needle_buf.len) return null;
    const needle = std.fmt.bufPrint(&needle_buf, "\"{s}\"", .{key}) catch return null;
    const key_pos = std.mem.indexOf(u8, json, needle) orelse return null;
    const after_key = json[key_pos + needle.len ..];
    const colon = std.mem.indexOfScalar(u8, after_key, ':') orelse return null;
    const value = std.mem.trimStart(u8, after_key[colon + 1 ..], &std.ascii.whitespace);
    if (value.len == 0) return null;

    var end: usize = 0;
    while (end < value.len) : (end += 1) {
        const ch = value[end];
        if (!(std.ascii.isDigit(ch) or ch == '-' or ch == '+' or ch == '.' or ch == 'e' or ch == 'E')) break;
    }
    if (end == 0) return null;
    return std.fmt.parseFloat(f64, value[0..end]) catch null;
}

fn containsEvent(comptime events: []const []const u8, expr: []const u8) bool {
    for (events) |event| if (std.mem.eql(u8, event, expr)) return true;
    return false;
}

test "extracts expression payload" {
    try std.testing.expectEqualStrings("turn.completed", extractJsonString("{\"expression\":\"turn.completed\"}", "expression").?);
}
test "extracts numeric bridge payload fields" {
    const payload = "{\"dx\":12.5,\"dy\":-3,\"open\":true}";
    try std.testing.expectEqual(@as(f64, 12.5), extractJsonNumber(payload, "dx").?);
    try std.testing.expectEqual(@as(f64, -3), extractJsonNumber(payload, "dy").?);
    try std.testing.expect(extractJsonNumber(payload, "open") == null);
}

test "parses config values and colors" {
    var config: Config = .{};
    parseConfig(
        \\speed = 2.5
        \\interval_ms = 25
        \\port = 9999
        \\ticker_speed_s = 7.5
        \\buffer_size = 42
        \\movement_enabled = true
        \\[colors]
        \\turn = "#fff"
    , &config);
    try std.testing.expectEqual(@as(u16, 9999), config.port);
    try std.testing.expect(config.movement_enabled);
    try std.testing.expectEqual(@as(usize, 1), config.color_count);
    try std.testing.expectEqualStrings("turn", config.colors[0].key[0..config.colors[0].key_len]);
}

test "session id fallback extracts nested payload session" {
    const body = "{\"hitch_event_type\":\"turn.started\",\"payload\":{\"session\":{\"id\":\"abc\"}}}";
    try std.testing.expectEqualStrings("abc", extractSessionId(body).?);
}

test "session id ignores nested non-session payload fields" {
    const body = "{\"hitch_event_type\":\"tool.requested\",\"payload\":{\"tool\":{\"input\":{\"session_id\":\"event-local\"}}}}";
    try std.testing.expect(extractSessionId(body) == null);
}

test "session id ignores nested payload session objects outside payload session" {
    const body = "{\"hitch_event_type\":\"tool.requested\",\"payload\":{\"tool\":{\"input\":{\"session\":{\"id\":\"event-local\"}}}}}";
    try std.testing.expect(extractSessionId(body) == null);
}

test "session id prefers top-level session id" {
    const body = "{\"hitch_event_type\":\"tool.requested\",\"session_id\":\"session-1\",\"payload\":{\"tool\":{\"input\":{\"session_id\":\"event-local\"}}}}";
    try std.testing.expectEqualStrings("session-1", extractSessionId(body).?);
}

test "session starts hidden until an event is received" {
    var session: Session = undefined;
    session.init("s", "h", 1);
    try std.testing.expect(session.window_created);
    try std.testing.expect(!session.window_visible);
    try std.testing.expect(!session.event_received);
    session.event_received = true;
    try std.testing.expect(session.event_received);
}

test "session queue drops oldest when full" {
    var session: Session = undefined;
    session.init("s", "h", 1);
    var i: usize = 0;
    while (i < max_events_per_session + 1) : (i += 1) session.enqueue("{\"hitch_event_type\":\"x\"}");
    try std.testing.expectEqual(@as(usize, max_events_per_session), session.event_count);
}
